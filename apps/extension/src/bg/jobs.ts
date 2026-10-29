// Runs the extension's share of the job queue: Vinted in a logged-in tab, and
// the assisted marketplaces by filling their sell forms for the seller.

import { generateListing, MARKETPLACES, type Item, type Job, type Listing, type MarketplaceId, type Profile } from '@pilego/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { between, errorText, ext, sleep, toBase64 } from '../shared/browser.ts';
import type { AssistReport, FillResult, ListingWork, PhotoBytes, VintedOutcome, VintedRequest } from '../shared/messages.ts';
import { blockMessage, capWait, noteWrite, readBlock } from '../shared/pace.ts';
import { postedListing, SITES } from '../assist/sites.ts';
import { activate, openTabs, readyTab, sendToTab, vintedSiteFor, waitForLoad } from './tabs.ts';

export const ASSIST_MARKETS: MarketplaceId[] = ['depop', 'poshmark', 'mercari', 'grailed', 'facebook'];

/** Marketplaces where pileGo fills every field and presses the site's own post button. */
export const AUTO_POST: MarketplaceId[] = ['depop', 'poshmark'];

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

async function toJpeg(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, bitmap.width, bitmap.height);
  g.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
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
    let type = r.headers.get('content-type') || 'image/jpeg';
    let bytes = await r.arrayBuffer();
    // Depop and Poshmark take JPEG and PNG only.
    if (!/jpe?g|png/.test(type)) {
      const jpeg = await toJpeg(new Blob([bytes], { type })).catch(() => null);
      if (jpeg) {
        bytes = await jpeg.arrayBuffer();
        type = 'image/jpeg';
      }
    }
    out.push({ data: toBase64(bytes), type, name: `${item.sku}-${i + 1}.${type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'}` });
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
      materials: it.materials ?? [],
      style_tags: it.style_tags ?? [],
      era: it.era ?? null,
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
  /** The tab could not post by itself and handed over to the seller. */
  stuck?: boolean;
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

  const auto = posting && AUTO_POST.includes(job.marketplace);
  // Pages in background tabs are throttled and some never finish rendering, so
  // a form pileGo fills by itself is filled in front.
  const tab = await ext.tabs.create({ url, active: first || auto });
  if (tab.id == null) return finish(sb, job, 'pending', 'Could not open a tab.', null, 300);
  const message = auto
    ? `pileGo is listing this on ${info.name} in the tab it opened.`
    : posting
      ? `Check the form pileGo filled in your ${info.name} tab, then press ${info.name}’s own post button.`
      : `${reason} Remove it in the ${info.name} tab pileGo opened.`;
  // needs_user before the form is filled, so the job is not handed out again
  // while the tab is working on it.
  await setListing(
    sb,
    listing.id,
    auto ? { status: 'publishing', error: null } : posting ? { status: 'needs_action', error: message } : { status: 'delisting', error: message },
  );
  await finish(sb, job, 'needs_user', message, { tab: true });
  const list = await waitingList();
  list[job.id] = { job, tab_id: tab.id, listing_id: listing.id, marketplace: job.marketplace, kind: posting ? 'post' : 'remove' };
  await setWaiting(list);

  await waitForLoad(tab.id);
  if (!auto) {
    await sendToTab(tab.id, posting ? { type: 'assist:fill', work } : { type: 'assist:remove', work, reason }, 30_000).catch(err =>
      console.warn('[pileGo] assist tab did not answer', errorText(err)),
    );
    return;
  }

  await activate(tab.id).catch(() => {});
  state.lastMessage = `Listing on ${info.name}…`;
  const reply = await sendToTab<FillResult>(tab.id, { type: 'assist:fill', work }, 30_000).catch(err => {
    // Posting navigates away, which closes the channel before the tab answers.
    console.debug('[pileGo] assist tab closed the channel', errorText(err));
    return null;
  });
  await settleAuto(sb, job.id, tab.id, reply);
}

/** Jobs already marked posted, so a report and a URL change do not both count. */
const settled = new Set<string>();

/** Steps the auto-post tabs last reported, by job: "Posting on Depop…" means the button was pressed. */
const lastStep = new Map<string, string>();

export function noteProgress(jobId: string, step: string) {
  lastStep.set(jobId, step);
}

/**
 * After an auto-post tab is done: the report or the new URL usually settles
 * the job. If neither has, the tab's address decides.
 */
async function settleAuto(sb: SupabaseClient, jobId: string, tabId: number, reply: FillResult | null) {
  const pressed = reply?.posted || /^(posting|listing) on/i.test(lastStep.get(jobId) ?? '');
  const end = Date.now() + (pressed ? 30_000 : 5_000);
  while (Date.now() < end) {
    const w = (await waitingList())[jobId];
    if (!w || w.stuck) break;
    await sleep(1000);
  }
  lastStep.delete(jobId);
  const list = await waitingList();
  const w = list[jobId];
  if (!w || w.stuck) return;
  const tab = await ext.tabs.get(tabId).catch(() => null);
  const url = tab?.url ?? null;
  const site = SITES[w.marketplace];
  delete list[jobId];
  await setWaiting(list);
  if (pressed && url && site && !site.sellPage.test(url)) return settlePosted(sb, w, url);
  const name = MARKETPLACES[w.marketplace].name;
  const message = reply?.error
    ? `${reply.error} Finish it in the ${name} tab.`
    : `pileGo could not finish the ${name} form. Finish it in the tab it opened, or press Retry.`;
  await setListing(sb, w.listing_id, { status: 'needs_action', error: message });
  await finish(sb, w.job, 'needs_user', message);
}

async function settlePosted(sb: SupabaseClient, w: Waiting, url: string | null) {
  if (settled.has(w.job.id)) return;
  settled.add(w.job.id);
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
  if (report.type === 'assist:stuck') {
    // Still waiting: the seller finishes the form, and posting it settles the job.
    w.stuck = true;
    await setWaiting(list);
    await setListing(sb, w.listing_id, { status: 'needs_action', error: report.message });
    await finish(sb, w.job, 'needs_user', report.message);
    return;
  }
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
/** Asked to run while already running: go round again when done. */
let again: boolean | null = null;

/**
 * Claim and run jobs. With `interactive`, pileGo may open a Vinted tab in the
 * background and opens the assisted sell forms; without it only Vinted runs,
 * and only in a Vinted tab that is already open.
 */
export async function runQueue(sb: SupabaseClient, interactive: boolean): Promise<number> {
  if (busy) {
    again = (again ?? false) || interactive;
    return 0;
  }
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
  if (again !== null) {
    // A poke from the app landed mid-run; its jobs were not claimed yet.
    const next = again;
    again = null;
    ran += await runQueue(sb, next);
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
