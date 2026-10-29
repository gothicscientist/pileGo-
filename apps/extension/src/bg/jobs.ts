// Runs the extension's share of the job queue: Vinted in a logged-in tab, and
// the assisted marketplaces by filling their sell forms for the seller.

import { generateListing, MARKETPLACES, type Item, type Job, type Listing, type MarketplaceId, type Profile } from '@pilego/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { between, errorText, ext, sleep, toBase64 } from '../shared/browser.ts';
import type { AssistReport, ListingWork, PhotoBytes, VintedOutcome, VintedRequest } from '../shared/messages.ts';
import { blockMessage, capWait, noteWrite, readBlock } from '../shared/pace.ts';
import { postedListing } from '../assist/sites.ts';
import { openTabs, readyTab, sendToTab, vintedSiteFor, waitForLoad } from './tabs.ts';

export const ASSIST_MARKETS: MarketplaceId[] = ['depop', 'poshmark', 'mercari', 'grailed', 'facebook'];

type FullProfile = Profile & { price_strategy?: 'same' | 'match_take_home' };

export interface RunState {
  running: Set<string>;
  lastError: string | null;
  lastMessage: string | null;
  /** Vinted tabs pileGo opened itself and closes when done. */
  openedTabs: Set<number>;
}

export const state: RunState = { running: new Set(), lastError: null, lastMessage: null, openedTabs: new Set() };

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

async function finish(
  sb: SupabaseClient,
  job: Job,
  status: 'done' | 'failed' | 'needs_user' | 'pending' | 'cancelled',
  error: string | null = null,
  result: Record<string, unknown> | null = null,
  retryIn?: number,
) {
  const { error: e } = await sb.rpc('finish_job', {
    p_job_id: job.id,
    p_status: status,
    p_result: result,
    p_error: error,
    p_retry_in_seconds: retryIn ?? null,
  });
  if (e) console.warn('[pileGo] finish_job failed', e.message);
}

async function setListing(sb: SupabaseClient, id: string, patch: Partial<Listing>) {
  const { error } = await sb.from('listings').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

async function learn(sb: SupabaseClient, market: MarketplaceId, learned: Record<string, unknown> | undefined) {
  const rows = Object.entries(learned ?? {}).map(([k, value]) => {
    const at = k.indexOf(':');
    return { marketplace: market, kind: k.slice(0, at), key: k.slice(at + 1), value };
  });
  if (!rows.length) return;
  const { error } = await sb.from('marketplace_mappings').upsert(rows, { onConflict: 'user_id,marketplace,kind,key' });
  if (error) console.warn('[pileGo] could not save mappings', error.message);
}

export async function loadProfile(sb: SupabaseClient): Promise<FullProfile | null> {
  const { data } = await sb.from('profiles').select('*').maybeSingle();
  return (data as FullProfile | null) ?? null;
}

async function photoBytes(sb: SupabaseClient, item: Item, max: number): Promise<PhotoBytes[]> {
  const photos = [...(item.photos ?? [])].sort((a, b) => a.position - b.position).slice(0, max);
  if (!photos.length) return [];
  const { data, error } = await sb.storage.from('photos').createSignedUrls(photos.map(p => p.path), 3600);
  if (error) throw new Error(`Could not read the photos: ${error.message}`);
  const out: PhotoBytes[] = [];
  for (const [i, signed] of (data ?? []).entries()) {
    if (!signed.signedUrl) continue;
    const r = await fetch(signed.signedUrl);
    if (!r.ok) continue;
    const type = r.headers.get('content-type') || 'image/jpeg';
    out.push({ data: toBase64(await r.arrayBuffer()), type, name: `${item.sku}-${i + 1}.${type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'}` });
  }
  return out;
}

/** Everything a marketplace tab needs for one job, built from the database. */
async function buildWork(sb: SupabaseClient, job: Job, withPhotos: boolean) {
  const [{ data: item }, { data: listing }, profile, { data: maps }] = await Promise.all([
    sb.from('items').select('*, photos:item_photos(*)').eq('id', job.item_id!).maybeSingle(),
    sb.from('listings').select('*').eq('id', job.listing_id!).maybeSingle(),
    loadProfile(sb),
    sb.from('marketplace_mappings').select('kind,key,value').eq('marketplace', job.marketplace),
  ]);
  if (!item || !listing) return null;
  const it = item as Item;
  const li = listing as Listing;
  const payload = (li.payload ?? {}) as Record<string, unknown>;
  const generated = generateListing(it, job.marketplace, {
    voice: profile?.voice,
    region: profile?.region,
    strategy: profile?.price_strategy,
    fee_overrides: profile?.fee_overrides,
  });
  const learned: Record<string, unknown> = {};
  for (const m of (maps ?? []) as Array<{ kind: string; key: string; value: unknown }>) learned[`${m.kind}:${m.key}`] = m.value;

  const work: ListingWork = {
    job_id: job.id,
    listing_id: li.id,
    marketplace: job.marketplace,
    listing: {
      ...generated,
      title: li.title || (payload.title as string | undefined) || generated.title,
      description: (payload.description as string | undefined)?.trim() || generated.description,
      price: li.price ?? generated.price,
    },
    item: {
      sku: it.sku,
      brand: it.brand,
      department: it.department,
      category: it.category,
      subcategory: it.subcategory,
      size: it.size,
      colors: it.colors ?? [],
      condition: it.condition,
      original_price: it.original_price,
    },
    photos: withPhotos ? await photoBytes(sb, it, MARKETPLACES[job.marketplace].photos_max) : [],
    learned,
    external_id: li.external_id,
    external_url: li.external_url,
  };
  return { work, item: it, listing: li, profile };
}

// ---------------------------------------------------------------------------
// Vinted
// ---------------------------------------------------------------------------

const vintedTabs = new Map<number, { site: string; logged_in: boolean }>();

export function noteVintedTab(tabId: number, site: string, loggedIn: boolean) {
  vintedTabs.set(tabId, { site, logged_in: loggedIn });
  void ext.storage.local.set({ 'vinted.site': site });
}

export function forgetTab(tabId: number) {
  vintedTabs.delete(tabId);
  state.openedTabs.delete(tabId);
}

/** A Vinted tab to work in. Opens one in the background when the seller just asked for something. */
export async function vintedTab(open: boolean, region?: string | null): Promise<number | null> {
  const tabs = await openTabs('vinted');
  const known = tabs.find(t => t.id != null && vintedTabs.get(t.id)?.logged_in) ?? tabs.find(t => t.id != null && !t.discarded);
  if (known && (await readyTab(known, { type: 'vinted:ping' }))) return known.id!;
  if (!open) return null;
  const site = ((await ext.storage.local.get('vinted.site'))['vinted.site'] as string | undefined) ?? vintedSiteFor(region);
  const tab = await ext.tabs.create({ url: `${site}/`, active: false });
  if (tab.id == null) return null;
  state.openedTabs.add(tab.id);
  await waitForLoad(tab.id);
  const ping = await sendToTab<VintedOutcome>(tab.id, { type: 'vinted:ping' } satisfies VintedRequest).catch(() => null);
  if (ping?.status === 'done' && !(ping.data as { logged_in?: boolean }).logged_in) {
    await ext.tabs.update(tab.id, { active: true });
    state.openedTabs.delete(tab.id);
    throw new Error('Log in to Vinted in the tab pileGo just opened, then try again.');
  }
  return tab.id;
}

export async function closeOpenedTabs() {
  for (const id of state.openedTabs) await ext.tabs.remove(id).catch(() => {});
  state.openedTabs.clear();
}

async function runVinted(sb: SupabaseClient, job: Job, interactive: boolean) {
  const block = await readBlock('vinted');
  if (block) {
    if (job.listing_id) await setListing(sb, job.listing_id, { status: job.kind === 'delist' ? 'delisting' : 'queued' }).catch(() => {});
    return finish(sb, job, 'pending', blockMessage('Vinted', block), null, Math.ceil((block.until - Date.now()) / 1000));
  }
  const writes = job.kind === 'publish' || job.kind === 'relist';
  if (writes) {
    const wait = await capWait('vinted');
    if (wait) {
      await setListing(sb, job.listing_id!, { status: 'queued', error: null });
      return finish(sb, job, 'pending', 'Waiting to keep a human pace on Vinted.', null, Math.ceil(wait / 1000));
    }
  }

  const ctx = await buildWork(sb, job, writes);
  if (!ctx) return finish(sb, job, 'cancelled', 'The item was deleted.');
  const { work, item, listing, profile } = ctx;
  if (writes && (item.status === 'sold' || item.status === 'shipped')) {
    await setListing(sb, listing.id, { status: 'draft' });
    return finish(sb, job, 'done', null, { skipped: 'sold' });
  }

  let tabId: number | null;
  try {
    tabId = await vintedTab(interactive, profile?.region);
  } catch (err) {
    if (job.listing_id) await setListing(sb, job.listing_id, { status: 'needs_action', error: errorText(err) });
    return finish(sb, job, 'needs_user', errorText(err));
  }
  if (tabId == null) {
    if (job.listing_id) await setListing(sb, job.listing_id, { status: job.kind === 'delist' ? 'delisting' : 'queued' });
    return finish(sb, job, 'pending', 'Waiting for a Vinted tab.', null, 600);
  }

  let msg: VintedRequest;
  switch (job.kind) {
    case 'publish':
      msg = { type: 'vinted:publish', work };
      break;
    case 'relist':
      msg = { type: 'vinted:relist', work };
      break;
    case 'delist':
      if (!listing.external_id) {
        if (listing.status !== 'sold') await setListing(sb, listing.id, { status: 'delisted', error: null });
        return finish(sb, job, 'done');
      }
      msg = { type: 'vinted:delist', external_id: listing.external_id };
      break;
    case 'update_price': {
      const price = Number((job.payload as { price?: number }).price ?? listing.price);
      if (!listing.external_id) return finish(sb, job, 'failed', 'This listing is not on Vinted yet.');
      msg = { type: 'vinted:price', external_id: listing.external_id, price };
      break;
    }
    default:
      return finish(sb, job, 'failed', `The extension does not run ${job.kind} jobs.`);
  }

  if (writes) await setListing(sb, listing.id, { status: 'publishing', error: null });
  const out = await sendToTab<VintedOutcome>(tabId, msg, 25_000).catch(
    err => ({ status: 'failed', message: errorText(err), retry_in: 300 }) as VintedOutcome,
  );
  const payload = (listing.payload ?? {}) as Record<string, unknown>;

  switch (out.status) {
    case 'listed':
      await noteWrite('vinted');
      await setListing(sb, listing.id, {
        status: 'listed',
        external_id: out.external_id,
        external_url: out.url,
        title: work.listing.title,
        price: work.listing.price,
        listed_at: new Date().toISOString(),
        relist_count: job.kind === 'relist' ? listing.relist_count + 1 : listing.relist_count,
        payload: { ...payload, draft_id: null, site: new URL(out.url).origin },
        error: null,
      });
      await learn(sb, 'vinted', out.learned);
      return finish(sb, job, 'done', null, { external_id: out.external_id, url: out.url });
    case 'needs_user':
      if (writes) await noteWrite('vinted');
      await setListing(sb, listing.id, {
        status: 'needs_action',
        error: out.message,
        external_url: out.url,
        payload: { ...payload, draft_id: out.draft_id ?? null },
      });
      await learn(sb, 'vinted', out.learned);
      return finish(sb, job, 'needs_user', out.message, { url: out.url });
    case 'done':
      if (job.kind === 'delist') {
        if (listing.status !== 'sold') await setListing(sb, listing.id, { status: 'delisted', error: null });
      } else if (job.kind === 'update_price') {
        await setListing(sb, listing.id, { price: (out.data as { price: number }).price });
      }
      return finish(sb, job, 'done', null, (out.data as Record<string, unknown>) ?? null);
    case 'failed': {
      const retry = out.blocked || (out.retry_in != null && job.attempts < 4);
      const back = job.kind === 'delist' ? 'delisting' : 'queued';
      await setListing(sb, listing.id, retry ? { status: back, error: null } : { status: 'failed', error: out.message });
      if (retry) {
        const block = await readBlock('vinted');
        const wait = block ? Math.ceil((block.until - Date.now()) / 1000) : (out.retry_in ?? 300) * job.attempts;
        return finish(sb, job, 'pending', out.message, null, wait);
      }
      return finish(sb, job, 'failed', out.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Assisted marketplaces: fill the form, the seller posts
// ---------------------------------------------------------------------------

interface Waiting {
  job: Job;
  tab_id: number;
  listing_id: string;
  marketplace: MarketplaceId;
  kind: 'post' | 'remove';
}

async function waitingList(): Promise<Record<string, Waiting>> {
  return ((await ext.storage.local.get('assist.waiting'))['assist.waiting'] as Record<string, Waiting> | undefined) ?? {};
}

async function setWaiting(list: Record<string, Waiting>) {
  await ext.storage.local.set({ 'assist.waiting': list });
}

async function runAssist(sb: SupabaseClient, job: Job, first: boolean) {
  const info = MARKETPLACES[job.marketplace];
  const posting = job.kind === 'publish' || job.kind === 'relist';
  const ctx = await buildWork(sb, job, posting);
  if (!ctx) return finish(sb, job, 'cancelled', 'The item was deleted.');
  const { work, item, listing } = ctx;

  if (posting && (item.status === 'sold' || item.status === 'shipped')) {
    await setListing(sb, listing.id, { status: 'draft' });
    return finish(sb, job, 'done', null, { skipped: 'sold' });
  }

  if (job.kind === 'update_price') {
    const price = (job.payload as { price?: number }).price ?? listing.price;
    const message = `Change the price on ${info.name} to ${price}. pileGo cannot edit ${info.name} listings for you.`;
    await setListing(sb, listing.id, { price: price ?? null });
    return finish(sb, job, 'needs_user', message);
  }

  let url: string;
  let reason = '';
  if (posting) url = info.sell_url;
  else {
    if (!listing.external_url || info.capabilities.delist === 'manual') {
      const message = `Remove this listing on ${info.name} by hand.`;
      await setListing(sb, listing.id, { status: 'needs_action', error: message });
      return finish(sb, job, 'needs_user', message);
    }
    url = listing.external_url;
    const p = job.payload as { reason?: string; sold_on?: string };
    reason = p.reason === 'sold_elsewhere' ? `Sold on ${MARKETPLACES[p.sold_on as MarketplaceId]?.name ?? 'another marketplace'}.` : 'You asked pileGo to take this down.';
  }

  const tab = await ext.tabs.create({ url, active: first });
  if (tab.id == null) return finish(sb, job, 'pending', 'Could not open a tab.', null, 300);
  const message = posting
    ? `Check the form pileGo filled in your ${info.name} tab, then press ${info.name}’s own post button.`
    : `${reason} Remove it in the ${info.name} tab pileGo opened.`;
  // needs_user before the form is filled, so the job is not handed out again
  // while the seller is still looking at it.
  await setListing(sb, listing.id, posting ? { status: 'needs_action', error: message } : { status: 'delisting', error: message });
  await finish(sb, job, 'needs_user', message, { tab: true });
  const list = await waitingList();
  list[job.id] = { job, tab_id: tab.id, listing_id: listing.id, marketplace: job.marketplace, kind: posting ? 'post' : 'remove' };
  await setWaiting(list);

  await waitForLoad(tab.id);
  await sendToTab(tab.id, posting ? { type: 'assist:fill', work } : { type: 'assist:remove', work, reason }, 30_000).catch(err =>
    console.warn('[pileGo] assist tab did not answer', errorText(err)),
  );
}

async function settlePosted(sb: SupabaseClient, w: Waiting, url: string | null) {
  const found = url ? postedListing(w.marketplace, url) : null;
  const { data: listing } = await sb.from('listings').select('*').eq('id', w.listing_id).maybeSingle();
  const li = listing as Listing | null;
  if (li) {
    await setListing(sb, w.listing_id, {
      status: 'listed',
      external_id: found?.id ?? li.external_id,
      external_url: found?.url ?? li.external_url,
      listed_at: new Date().toISOString(),
      relist_count: w.job.kind === 'relist' ? li.relist_count + 1 : li.relist_count,
      error: found ? null : 'Paste the listing link on the item page so pileGo can check it for sales.',
    });
  }
  await finish(sb, w.job, 'done', null, { url: found?.url ?? null });
}

/** A report from an assist tab: posted, removed, or the seller stopped. */
export async function onAssistReport(sb: SupabaseClient, report: AssistReport, tabUrl: string | null) {
  const list = await waitingList();
  const w = list[report.job_id];
  if (!w) return;
  delete list[report.job_id];
  await setWaiting(list);
  const name = MARKETPLACES[w.marketplace].name;
  if (report.type === 'assist:posted') await settlePosted(sb, w, report.url ?? tabUrl);
  else if (report.type === 'assist:removed') {
    const { data } = await sb.from('listings').select('status').eq('id', w.listing_id).maybeSingle();
    if ((data as { status?: string } | null)?.status !== 'sold') await setListing(sb, w.listing_id, { status: 'delisted', error: null });
    await finish(sb, w.job, 'done');
  } else {
    const message = w.kind === 'post' ? `${report.message} Press Retry to open the ${name} form again.` : report.message;
    await setListing(sb, w.listing_id, { status: 'needs_action', error: message });
    await finish(sb, w.job, 'needs_user', message);
  }
}

/** The seller published and the site moved on to the new listing: that is as good as pressing "I've posted it". */
export async function onTabUrl(sb: SupabaseClient, tabId: number, url: string) {
  const list = await waitingList();
  for (const [id, w] of Object.entries(list)) {
    if (w.tab_id !== tabId || w.kind !== 'post') continue;
    if (!postedListing(w.marketplace, url)) continue;
    delete list[id];
    await setWaiting(list);
    await settlePosted(sb, w, url);
  }
}

export async function onTabClosed(tabId: number) {
  forgetTab(tabId);
  const list = await waitingList();
  let changed = false;
  for (const [id, w] of Object.entries(list)) {
    if (w.tab_id === tabId) {
      delete list[id];
      changed = true;
    }
  }
  if (changed) await setWaiting(list);
}

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

let busy = false;

/**
 * Claim and run jobs. On a timer only Vinted runs, and only with a Vinted tab
 * open. When the seller has just asked for something (interactive), pileGo
 * may open a Vinted tab in the background and opens the assisted sell forms.
 */
export async function runQueue(sb: SupabaseClient, interactive: boolean): Promise<number> {
  if (busy) return 0;
  busy = true;
  let ran = 0;
  try {
    const markets: MarketplaceId[] = [];
    const block = await readBlock('vinted');
    if (!block && (interactive || (await openTabs('vinted')).length)) markets.push('vinted');
    if (block) state.lastError = blockMessage('Vinted', block);
    if (interactive) markets.push(...ASSIST_MARKETS);
    if (!markets.length) return 0;

    const { data, error } = await sb.rpc('claim_jobs', { p_runner: 'extension', p_marketplaces: markets, p_limit: 6 });
    if (error) throw new Error(error.message);
    const jobs = (data ?? []) as Job[];
    let firstAssist = true;
    for (const job of jobs) {
      state.running.add(job.id);
      try {
        if (job.marketplace === 'vinted') {
          if (ran > 0) await sleep(between(8000, 12_000));
          await runVinted(sb, job, interactive);
        } else {
          await runAssist(sb, job, firstAssist);
          firstAssist = false;
        }
        ran += 1;
      } catch (err) {
        state.lastError = errorText(err);
        if (job.listing_id) await setListing(sb, job.listing_id, { status: 'failed', error: errorText(err) }).catch(() => {});
        await finish(sb, job, job.attempts < 3 ? 'pending' : 'failed', errorText(err), null, 300 * job.attempts);
      } finally {
        state.running.delete(job.id);
      }
    }
    if (jobs.some(j => j.marketplace === 'vinted')) state.lastError = (await readBlock('vinted')) ? state.lastError : null;
  } finally {
    busy = false;
    await closeOpenedTabs();
  }
  return ran;
}

/** Jobs waiting for the seller to open the extension, for the badge. */
export async function waitingCount(sb: SupabaseClient): Promise<number> {
  const { count } = await sb
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('runner', 'extension')
    .eq('status', 'pending')
    .in('marketplace', ASSIST_MARKETS);
  return count ?? 0;
}
