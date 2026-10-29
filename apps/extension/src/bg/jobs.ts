// Runs the extension's share of the job queue: Vinted in a logged-in tab, and
// the assisted marketplaces by filling their sell forms for the seller.

import { generateListing, MARKETPLACES, type Item, type Job, type Listing, type MarketplaceId, type Profile } from '@pilego/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { between, errorText, ext, sleep, toBase64, within } from '../shared/browser.ts';
import type { AssistReport, FillResult, ListingWork, PhotoBytes, VintedOutcome, VintedRequest } from '../shared/messages.ts';
import { blockMessage, capWait, noteWrite, readBlock } from '../shared/pace.ts';
import { leftForm, postedListing } from '../assist/sites.ts';
import { activate, navigate, openTabs, readyTab, sendToTab, vintedSiteFor, waitForLoad } from './tabs.ts';

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

/** The longest one Vinted request may take, photo uploads and all. */
const VINTED_TIMEOUT = 5 * 60_000;

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
  const out = await within(
    sendToTab<VintedOutcome>(tabId, msg, 25_000).catch(err => ({ status: 'failed', message: errorText(err), retry_in: 300 }) as VintedOutcome),
    VINTED_TIMEOUT,
    { status: 'failed', message: 'The Vinted tab stopped answering.', retry_in: 300 },
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
  /** When pileGo opened the tab, for settling ones a lost answer left behind. */
  started_at?: number;
  /** The listing's title, for finding it on a closet page after posting. */
  title?: string;
  /** pileGo pressed the site's own post button. */
  pressed?: boolean;
  /** The tab could not post by itself and handed over to the seller. */
  stuck?: boolean;
}

/** The longest a sell form may take, photos and all, before pileGo stops waiting for the tab to answer. */
const FILL_TIMEOUT = 10 * 60_000;

/** Fresh forms pileGo tries when the site's server fails, before it waits and tries again later. */
const SERVER_TRIES = 3;

async function waitingList(): Promise<Record<string, Waiting>> {
  return ((await ext.storage.local.get('assist.waiting'))['assist.waiting'] as Record<string, Waiting> | undefined) ?? {};
}

let waitingLock: Promise<unknown> = Promise.resolve();

/**
 * Read, change and save the waiting list, one change at a time, so a tab's
 * report and its address change never both claim the same job.
 */
function editWaiting<T>(change: (list: Record<string, Waiting>) => T): Promise<T> {
  const next = waitingLock.then(async () => {
    const list = await waitingList();
    const out = change(list);
    await ext.storage.local.set({ 'assist.waiting': list });
    return out;
  });
  waitingLock = next.catch(() => {});
  return next;
}

/** Take a job off the waiting list; only the first caller gets it. */
const takeWaiting = (jobId: string) =>
  editWaiting(list => {
    const w = list[jobId];
    delete list[jobId];
    return w ?? null;
  });

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
  const tabId = tab.id;
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
  await editWaiting(list => {
    list[job.id] = {
      job,
      tab_id: tabId,
      listing_id: listing.id,
      marketplace: job.marketplace,
      kind: posting ? 'post' : 'remove',
      started_at: Date.now(),
      title: work.listing.title || work.listing.description.split('\n')[0],
    };
  });

  const ready = await openForm(tabId, url, posting);
  if (!auto) {
    if (ready) void ext.tabs.sendMessage(tabId, posting ? { type: 'assist:fill', work } : { type: 'assist:remove', work, reason }).catch(() => {});
    return;
  }

  await activate(tabId).catch(() => {});
  state.lastMessage = `Listing on ${info.name}…`;
  // A page that never brings up the content script (the site is down, or a
  // browser error page) is worth a fresh load too.
  const unloaded: FillResult = { ok: false, filled: [], missing: [], photos: 0, posted: false, retry: true, error: `The ${info.name} page did not load.` };
  let reply = ready ? await fillTab(tabId, work) : unloaded;
  for (let attempt = 2; reply?.retry && attempt <= SERVER_TRIES; attempt += 1) {
    // The site's server failed, not the form: wait a little, then fill a fresh one.
    const still = await editWaiting(list => {
      const w = list[job.id];
      if (w) w.pressed = false;
      return Boolean(w);
    });
    if (!still) return;
    pressedJobs.delete(job.id);
    state.lastMessage = `${info.name}’s server had a problem. Trying again (${attempt} of ${SERVER_TRIES})…`;
    await sleep(10_000 * (attempt - 1));
    await navigate(tabId, url);
    reply = (await openForm(tabId, url, true)) ? await fillTab(tabId, work) : unloaded;
  }
  if (reply?.retry) return retryLater(sb, job.id, tabId, reply.error ?? `${info.name}’s server had a problem.`);
  await settleAuto(sb, job.id, tabId, reply);
}

/** Wait for a freshly opened tab and its content script. */
async function openForm(tabId: number, url: string, posting: boolean): Promise<boolean> {
  await waitForLoad(tabId);
  if (posting) await backToForm(tabId, url);
  // Wait for the content script with pings, then send the job once. Resending
  // it after posting has moved the tab on would start a second fill there.
  return sendToTab(tabId, { type: 'assist:ping' }, 30_000).then(
    () => true,
    err => (console.warn('[pileGo] assist tab did not answer', errorText(err)), false),
  );
}

/** Hand the job to the tab and wait for it to fill and post, but not for ever. */
function fillTab(tabId: number, work: ListingWork): Promise<FillResult | null> {
  const sent = (ext.tabs.sendMessage(tabId, { type: 'assist:fill', work }) as Promise<FillResult | undefined>).then(
    r => r ?? null,
    err => {
      // Posting navigates away, which closes the channel before the tab answers.
      console.debug('[pileGo] assist tab closed the channel', errorText(err));
      return null;
    },
  );
  return within(sent, FILL_TIMEOUT, null);
}

/**
 * Marketplaces sometimes bounce the sell page somewhere else on first load
 * (Poshmark to the seller's closet), so go back to the form once.
 */
async function backToForm(tabId: number, url: string) {
  const want = new URL(url).pathname.replace(/\/+$/, '');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const now = await ext.tabs.get(tabId).catch(() => null);
    if (!now?.url) return;
    if (new URL(now.url).pathname.replace(/\/+$/, '').startsWith(want)) return;
    await ext.tabs.update(tabId, { url }).catch(() => {});
    await sleep(500);
    await waitForLoad(tabId);
  }
}

/** The site's server kept failing: close the tab and queue the job again, so it goes up later by itself. */
async function retryLater(sb: SupabaseClient, jobId: string, tabId: number, error: string) {
  const w = await takeWaiting(jobId);
  if (!w) return;
  await ext.tabs.remove(tabId).catch(() => {});
  const name = MARKETPLACES[w.marketplace].name;
  if (w.job.attempts < 4) {
    const message = `${error} pileGo will try ${name} again in 10 minutes.`;
    state.lastMessage = message;
    await setListing(sb, w.listing_id, { status: 'queued', error: message });
    return finish(sb, w.job, 'pending', message, null, 600);
  }
  const message = `${error} pileGo tried ${name} ${w.job.attempts} times. Press Retry to try again.`;
  state.lastMessage = message;
  await setListing(sb, w.listing_id, { status: 'needs_action', error: message });
  return finish(sb, w.job, 'needs_user', message);
}

/** Jobs already marked posted, so a report and a URL change do not both count. */
const settled = new Set<string>();

/** Jobs whose tab has pressed the post button, so the flag is saved once. */
const pressedJobs = new Set<string>();

/** A step from an auto-post tab. "Posting on Depop…" means the post button was pressed. */
export async function noteProgress(jobId: string, step: string) {
  // A tab still ticking after its job settled must not put "Listing on…" back up.
  if (settled.has(jobId)) return;
  if (step) state.lastMessage = step;
  if (!/^(posting|listing) on/i.test(step) || pressedJobs.has(jobId)) return;
  pressedJobs.add(jobId);
  await editWaiting(list => {
    if (list[jobId]) list[jobId].pressed = true;
  });
}

/** What a tab's content script says is wrong with its page, such as a 500 error page. */
async function tabError(tabId: number): Promise<string | null> {
  const ping = (ext.tabs.sendMessage(tabId, { type: 'assist:ping' }) as Promise<{ error?: string | null } | undefined>).catch(() => undefined);
  return (await within(ping, 3000, undefined))?.error ?? null;
}

/**
 * After an auto-post tab is done: the report or the new URL usually settles
 * the job. If neither has, the tab's address decides.
 */
async function settleAuto(sb: SupabaseClient, jobId: string, tabId: number, reply: FillResult | null) {
  const before = (await waitingList())[jobId];
  const end = Date.now() + (reply?.posted || before?.pressed ? 30_000 : 5_000);
  let w = before;
  while (Date.now() < end) {
    w = (await waitingList())[jobId];
    if (!w || w.stuck) break;
    await sleep(1000);
  }
  pressedJobs.delete(jobId);
  if (!w || w.stuck) return;
  const tab = await ext.tabs.get(tabId).catch(() => null);
  const url = tab?.url ?? null;
  // The site took the post when the tab said so, or when it moved on from the form to a page that is not an error.
  const moved = Boolean(w.pressed && url && leftForm(w.marketplace, url) && !(await tabError(tabId)));
  if (reply?.posted || moved) {
    const mine = await takeWaiting(jobId);
    if (mine) await settlePosted(sb, mine, url);
    return;
  }
  const name = MARKETPLACES[w.marketplace].name;
  const message = reply?.error
    ? `${reply.error} Finish it in the ${name} tab.`
    : `pileGo could not finish the ${name} form. Finish it in the tab it opened, or press Retry.`;
  // Still waiting: if the seller posts it by hand, the new address settles the job.
  const still = await editWaiting(list => {
    if (list[jobId]) list[jobId].stuck = true;
    return Boolean(list[jobId]);
  });
  if (!still) return;
  state.lastMessage = message;
  await setListing(sb, w.listing_id, { status: 'needs_action', error: message });
  await finish(sb, w.job, 'needs_user', message);
}

async function settlePosted(sb: SupabaseClient, w: Waiting, url: string | null) {
  if (settled.has(w.job.id)) return;
  settled.add(w.job.id);
  pressedJobs.delete(w.job.id);
  let found = url ? postedListing(w.marketplace, url) : null;
  if (!found && w.title) {
    // Landed on the closet or the feed: the new listing is usually on it, once the page is up.
    await waitForLoad(w.tab_id, 15_000);
    const ask = sendToTab<{ url?: string | null }>(w.tab_id, { type: 'assist:find', marketplace: w.marketplace, title: w.title }, 8000).catch(() => undefined);
    const link = (await within(ask, 20_000, undefined))?.url;
    found = link ? postedListing(w.marketplace, link) : null;
  }
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
  state.lastMessage = `Listed on ${MARKETPLACES[w.marketplace].name}.`;
  await finish(sb, w.job, 'done', null, { url: found?.url ?? null });
}

/** A report from an assist tab: posted, removed, or the seller stopped. */
export async function onAssistReport(sb: SupabaseClient, report: AssistReport, tabUrl: string | null) {
  if (report.type === 'assist:stuck') {
    if (settled.has(report.job_id)) return;
    // Still waiting: the seller finishes the form, and posting it settles the job.
    const w = await editWaiting(list => {
      const w = list[report.job_id];
      if (w) w.stuck = true;
      return w ?? null;
    });
    if (!w) return;
    state.lastMessage = report.message;
    await setListing(sb, w.listing_id, { status: 'needs_action', error: report.message });
    await finish(sb, w.job, 'needs_user', report.message);
    return;
  }
  const w = await takeWaiting(report.job_id);
  if (!w) return;
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

/**
 * The site moved on from the form: to the new listing, or (once pileGo has
 * pressed post) to the closet or feed. That is as good as "I've posted it".
 */
export async function onTabUrl(sb: SupabaseClient, tabId: number, url: string) {
  const hits = await editWaiting(list => {
    const out: Waiting[] = [];
    for (const [id, w] of Object.entries(list)) {
      if (w.tab_id !== tabId || w.kind !== 'post') continue;
      if (!postedListing(w.marketplace, url) && !(w.pressed && leftForm(w.marketplace, url))) continue;
      delete list[id];
      out.push(w);
    }
    return out;
  });
  for (const w of hits) await settlePosted(sb, w, url);
}

/** A tab pileGo was working in closed: say so on the listing instead of leaving it on "Listing…". */
export async function onTabClosed(sb: SupabaseClient | null, tabId: number) {
  forgetTab(tabId);
  const gone = await editWaiting(list => {
    const out: Waiting[] = [];
    for (const [id, w] of Object.entries(list)) {
      if (w.tab_id !== tabId) continue;
      delete list[id];
      out.push(w);
    }
    return out;
  });
  if (!sb) return;
  for (const w of gone) {
    pressedJobs.delete(w.job.id);
    // A stuck form already told the seller what to do.
    if (w.stuck || settled.has(w.job.id)) continue;
    const name = MARKETPLACES[w.marketplace].name;
    const message =
      w.kind === 'remove'
        ? `The ${name} tab closed before the listing came down. Take it down on ${name} by hand, or press Retry.`
        : w.pressed
          ? `pileGo pressed ${name}’s post button, then the tab closed before ${name} showed the new listing. If it is on ${name}, paste its link on the item page; if not, press Retry.`
          : `The ${name} tab closed before the listing went up. Press Retry to open it again.`;
    await setListing(sb, w.listing_id, { status: 'needs_action', error: message }).catch(() => {});
    await finish(sb, w.job, 'needs_user', message);
  }
}

/**
 * Settle what a lost answer or a restarted worker left behind: a closed tab,
 * or an auto-post tab nobody has heard from since the fill should have ended.
 */
async function sweepWaiting(sb: SupabaseClient) {
  for (const [id, w] of Object.entries(await waitingList())) {
    if (state.running.has(id)) continue;
    const tab = await ext.tabs.get(w.tab_id).catch(() => null);
    if (!tab) {
      await onTabClosed(sb, w.tab_id);
      continue;
    }
    const age = Date.now() - (w.started_at ?? 0);
    if (w.stuck) {
      // The seller has had a day to finish it by hand; the listing already says so.
      if (age > 24 * 3600_000) await takeWaiting(id);
      continue;
    }
    if (w.kind === 'post' && AUTO_POST.includes(w.marketplace) && age > FILL_TIMEOUT + 60_000) await settleAuto(sb, id, w.tab_id, null);
  }
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

    await sweepWaiting(sb).catch(err => console.warn('[pileGo] could not check waiting tabs', errorText(err)));

    const { data, error } = await sb.rpc('claim_jobs', { p_runner: 'extension', p_marketplaces: markets, p_limit: 6 });
    if (error) throw new Error(error.message);
    // Vinted first: it takes seconds in a background tab, while each sell form
    // takes minutes in front, and it should not wait behind them.
    const jobs = ((data ?? []) as Job[]).sort((a, b) => Number(b.marketplace === 'vinted') - Number(a.marketplace === 'vinted'));
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
