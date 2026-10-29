// The server side of the job queue: everything eBay. The extension runs the
// rest of the queue from the seller's browser.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import type { Item, Job, Listing, Profile } from './core/types.ts';
import { EbayError, EbayNotConnected, getUserToken, siteFor, trading, escapeXml } from './ebay.ts';
import { ensureSetup, NeedsSeller, publishToEbay, updateEbayPrice, withdrawFromEbay } from './ebay-listing.ts';

const PHOTO_URL_TTL = 60 * 60 * 24 * 30;

export interface JobOutcome {
  id: string;
  kind: string;
  status: 'done' | 'failed' | 'needs_user' | 'pending' | 'cancelled';
  message?: string;
}

async function loadContext(admin: SupabaseClient, job: Job) {
  const [{ data: item }, { data: listing }, { data: profile }, { data: account }] = await Promise.all([
    admin.from('items').select('*, photos:item_photos(*)').eq('id', job.item_id!).maybeSingle(),
    job.listing_id ? admin.from('listings').select('*').eq('id', job.listing_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from('profiles').select('*').eq('id', job.user_id).maybeSingle(),
    admin.from('marketplace_accounts').select('*').eq('user_id', job.user_id).eq('marketplace', 'ebay').maybeSingle(),
  ]);
  return {
    item: item as (Item & { photos: Item['photos'] }) | null,
    listing: listing as Listing | null,
    profile: profile as (Profile & { price_strategy: 'same' | 'match_take_home' }) | null,
    account: account as { status: string; meta: Record<string, unknown> } | null,
  };
}

async function photoUrls(admin: SupabaseClient, item: Item): Promise<string[]> {
  const photos = [...(item.photos ?? [])].sort((a, b) => a.position - b.position).slice(0, 24);
  if (!photos.length) return [];
  const { data, error } = await admin.storage.from('photos').createSignedUrls(photos.map(p => p.path), PHOTO_URL_TTL);
  if (error) throw error;
  return (data ?? []).map(d => d.signedUrl).filter(Boolean) as string[];
}

async function finish(
  admin: SupabaseClient,
  job: Job,
  status: JobOutcome['status'],
  result: Record<string, unknown> | null,
  error: string | null,
  retryIn?: number,
): Promise<JobOutcome> {
  await admin.rpc('finish_job', {
    p_job_id: job.id,
    p_status: status,
    p_result: result,
    p_error: error,
    p_retry_in_seconds: retryIn ?? null,
  });
  return { id: job.id, kind: job.kind, status, message: error ?? undefined };
}

function withoutAspectQuestions(payload: Record<string, unknown>): Record<string, unknown> {
  const { missing_aspects: _missing, aspect_choices: _choices, ...rest } = payload;
  return rest;
}

async function setListing(admin: SupabaseClient, id: string, patch: Partial<Listing>): Promise<void> {
  const { error } = await admin.from('listings').update(patch).eq('id', id);
  if (error) throw error;
}

export async function runServerJob(admin: SupabaseClient, job: Job): Promise<JobOutcome> {
  if (job.marketplace !== 'ebay') {
    return finish(admin, job, 'failed', null, `The server cannot run ${job.marketplace} jobs.`);
  }
  const ctx = await loadContext(admin, job);
  if (!ctx.item || !ctx.profile) return finish(admin, job, 'cancelled', null, 'The item was deleted.');
  const site = siteFor((ctx.account?.meta?.region as string) ?? ctx.profile.region);

  try {
    const token = await getUserToken(admin, job.user_id);
    switch (job.kind) {
      case 'publish':
      case 'relist': {
        const listing = ctx.listing!;
        if (ctx.item.status === 'sold' || ctx.item.status === 'shipped') {
          await setListing(admin, listing.id, { status: 'draft' });
          return finish(admin, job, 'done', { skipped: 'sold' }, null);
        }
        await setListing(admin, listing.id, { status: 'publishing', error: null });
        const setup = await ensureSetup(admin, job.user_id, token, site, (ctx.account?.meta ?? {}) as Record<string, string>);
        const payload = (listing.payload ?? {}) as Record<string, unknown>;
        let offerId = (payload.offer_id as string | undefined) ?? null;
        if (job.kind === 'relist' && offerId) await withdrawFromEbay(token, offerId);
        const result = await publishToEbay(token, {
          item: ctx.item,
          imageUrls: await photoUrls(admin, ctx.item),
          site,
          setup,
          profile: ctx.profile,
          overrides: {
            title: listing.title ?? (payload.title as string | undefined),
            price: listing.price ?? undefined,
            description: payload.description as string | undefined,
            aspects: payload.aspects as Record<string, string[]> | undefined,
            category_id: payload.category_id as string | undefined,
          },
          offerId,
        });
        offerId = result.offer_id;
        await setListing(admin, listing.id, {
          status: 'listed',
          external_id: result.listing_id,
          external_url: result.url,
          title: result.title,
          price: result.price,
          listed_at: new Date().toISOString(),
          relist_count: job.kind === 'relist' && listing.external_id ? listing.relist_count + 1 : listing.relist_count,
          payload: {
            ...withoutAspectQuestions(payload),
            offer_id: offerId,
            sku: ctx.item.sku,
            category_id: result.category_id,
            category_name: result.category_name,
          },
          error: null,
        });
        return finish(admin, job, 'done', result as unknown as Record<string, unknown>, null);
      }
      case 'delist': {
        const listing = ctx.listing!;
        const payload = (listing.payload ?? {}) as Record<string, unknown>;
        if (payload.offer_id) {
          await withdrawFromEbay(token, payload.offer_id as string);
        } else if (listing.external_id) {
          // Imported listing created outside the Inventory API.
          await trading(
            'EndFixedPriceItem',
            token,
            site,
            `<ItemID>${escapeXml(listing.external_id)}</ItemID><EndingReason>NotAvailable</EndingReason>`,
          ).catch(err => {
            if (err instanceof EbayError && /already been closed|ended/i.test(err.message)) return '';
            throw err;
          });
        }
        if (listing.status !== 'sold') await setListing(admin, listing.id, { status: 'delisted', error: null });
        return finish(admin, job, 'done', null, null);
      }
      case 'update_price': {
        const listing = ctx.listing!;
        const payload = (listing.payload ?? {}) as Record<string, unknown>;
        const price = Number((job.payload as Record<string, unknown>).price ?? listing.price);
        if (!payload.offer_id) throw new NeedsSeller('Change the price on eBay directly for imported listings.');
        await updateEbayPrice(token, site, ctx.item.sku, payload.offer_id as string, price);
        await setListing(admin, listing.id, { price });
        return finish(admin, job, 'done', { price }, null);
      }
      default:
        return finish(admin, job, 'failed', null, `Unknown job ${job.kind}.`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const needsUser = err instanceof NeedsSeller || err instanceof EbayNotConnected;
    if (job.listing_id) {
      const patch: Partial<Listing> = { status: needsUser ? 'needs_action' : 'failed', error: message };
      // Remember which item specifics eBay wants, so the app can ask for them.
      if (ctx.listing && (job.kind === 'publish' || job.kind === 'relist')) {
        const rest = withoutAspectQuestions((ctx.listing.payload ?? {}) as Record<string, unknown>);
        const asks = err instanceof NeedsSeller && Object.keys(err.choices).length ? err : null;
        patch.payload = asks ? { ...rest, missing_aspects: asks.missing, aspect_choices: asks.choices } : rest;
      }
      await setListing(admin, job.listing_id, patch).catch(() => {});
    }
    if (needsUser) return finish(admin, job, 'needs_user', null, message);
    const transient = err instanceof EbayError && (err.status === 429 || err.status >= 500);
    if (transient && job.attempts < 4) {
      if (job.listing_id) await setListing(admin, job.listing_id, { status: 'queued', error: null }).catch(() => {});
      return finish(admin, job, 'pending', null, message, 120 * job.attempts);
    }
    console.error('eBay job failed', job.id, message, err instanceof EbayError ? JSON.stringify(err.body).slice(0, 800) : '');
    return finish(admin, job, 'failed', null, message);
  }
}
