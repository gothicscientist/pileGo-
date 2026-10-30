// Runs on the sell pages of Depop, Poshmark, Mercari and Grailed. It fills
// every field and presses the site's own post button, with a few seconds to
// press Stop first.

import { MARKETPLACES, type MarketplaceId } from '@pilego/core';
import { ext, fromBase64, send, sleep } from '../shared/browser.ts';
import type { AssistProgress, AssistReport, AssistRequest, FillResult, ListingWork, OverlayView } from '../shared/messages.ts';
import { cardShown, cardStep, closeCard, resetCard, showCard, type CardAction } from '../shared/overlay.ts';
import { readComps } from './comps.ts';
import { watchSellerAddress } from './seller-address.ts';
import { fillDepop } from './depop.ts';
import { pageError, waitFor } from './dom.ts';
import { pageIsProduct, rankListings, shopUrl } from './find.ts';
import { Stopped, type Driver, type DriverContext } from './driver.ts';
import { fillGrailed } from './grailed.ts';
import { fillMercari } from './mercari.ts';
import { fillPoshmark } from './poshmark.ts';
import { addPhotos, findField, findPhotoInput, postedListing, setValue, siteFor, SITES, type FieldKey } from './sites.ts';

function files(work: ListingWork): File[] {
  const max = MARKETPLACES[work.marketplace].photos_max;
  return work.photos.slice(0, max).map((p, i) => new File([fromBase64(p.data, p.type)], p.name || `photo-${i + 1}.jpg`, { type: p.type }));
}

function valueFor(work: ListingWork, key: FieldKey): string | null {
  switch (key) {
    case 'title':
      return work.listing.title || null;
    case 'description':
      return work.listing.description || null;
    case 'price':
      return work.listing.price != null ? String(work.listing.price) : null;
    case 'original_price':
      return work.item.original_price != null ? String(work.item.original_price) : null;
    case 'brand':
      return work.item.brand;
    case 'size':
      return work.item.size;
  }
}

async function fill(work: ListingWork): Promise<{ filled: FieldKey[]; photos: number }> {
  const site = SITES[work.marketplace] ?? siteFor(location.href);
  const photos = files(work);
  let added = 0;

  if (site?.photosFirst) {
    const input = await waitFor(() => findPhotoInput(document), 20_000);
    if (input && photos.length) {
      addPhotos(input, photos);
      added = input.multiple ? photos.length : 1;
    }
    await waitFor(() => findField(document, 'title', site), 30_000);
  } else {
    await waitFor(() => findField(document, 'description', site) ?? findField(document, 'title', site), 30_000);
    const input = findPhotoInput(document);
    if (input && photos.length) {
      addPhotos(input, photos);
      added = input.multiple ? photos.length : 1;
      await sleep(1500);
    }
  }

  const filled: FieldKey[] = [];
  // Description last: some forms reset text areas when a photo finishes processing.
  for (const key of ['title', 'brand', 'size', 'price', 'original_price', 'description'] as FieldKey[]) {
    if (site?.skip?.includes(key)) continue;
    const value = valueFor(work, key);
    if (!value) continue;
    if (key === 'description') await sleep(800);
    const el = findField(document, key, site);
    if (!el) continue;
    setValue(el, value);
    filled.push(key);
    await sleep(250);
  }
  return { filled, photos: added };
}

// ---------------------------------------------------------------------------
// The card in the bottom right (see shared/overlay.ts).
// ---------------------------------------------------------------------------

const closePanel = closeCard;
const itemName = (work: ListingWork) => work.listing.title || work.listing.description.split('\n')[0] || work.item.sku;

function report(msg: AssistReport | AssistProgress) {
  void send(msg);
}

// ---------------------------------------------------------------------------
// Depop, Poshmark, Mercari and Grailed: fill everything and post, with a Stop button.
// ---------------------------------------------------------------------------

const DRIVERS: Partial<Record<MarketplaceId, Driver>> = { depop: fillDepop, poshmark: fillPoshmark, mercari: fillMercari, grailed: fillGrailed };

/** Seconds the seller has to press Stop before pileGo presses the site's post button. */
const GRACE_SECONDS = 3;

let stopped = false;
let stopAddressFill = () => {};

function stop() {
  stopped = true;
  stopAddressFill();
}

function progressPanel(work: ListingWork, message: string) {
  const name = MARKETPLACES[work.marketplace].name;
  showCard({
    marketplace: work.marketplace,
    item: itemName(work),
    state: 'working',
    heading: `Listing on ${name}`,
    message,
    secondary: { label: 'Stop', onClick: () => { stop(); cardStep('Stopping…'); } },
  });
}

async function runDriver(work: ListingWork, driver: Driver): Promise<FillResult> {
  const name = MARKETPLACES[work.marketplace].name;
  stopped = false;
  let shownStep = '';
  const ctx: DriverContext = {
    step(message) {
      shownStep = message;
      if (!stopped) progressPanel(work, message);
      report({ type: 'assist:progress', job_id: work.job_id, step: message });
    },
    check() {
      if (stopped) throw new Stopped();
    },
    async beforePost() {
      for (let left = GRACE_SECONDS; left > 0; left -= 1) {
        if (stopped) return false;
        ctx.step(`Everything is filled in. Posting in ${left}…`);
        await sleep(1000);
      }
      return !stopped;
    },
  };
  resetCard();
  progressPanel(work, 'Starting…');
  // Chrome stops an idle background worker after 30 seconds; a photo upload can take longer.
  const heartbeat = setInterval(() => report({ type: 'assist:progress', job_id: work.job_id, step: shownStep }), 10_000);
  let result: FillResult;
  try {
    result = await driver(work, files(work), ctx);
  } catch (err) {
    if (err instanceof Stopped) {
      report({ type: 'assist:gave-up', job_id: work.job_id, message: `You stopped pileGo on ${name}.` });
      closePanel();
      return { ok: false, filled: [], missing: [], photos: 0, posted: false, error: 'Stopped' };
    }
    result = { ok: false, filled: [], missing: [], photos: 0, posted: false, error: `${shownStep} ${String(err)}`.trim() };
  } finally {
    clearInterval(heartbeat);
  }

  if (result.posted) {
    // The background finds the link (the site may not have gone to the new
    // listing) and keeps this card up on whatever page the tab lands on.
    const url = postedListing(work.marketplace, location.href)?.url ?? location.href;
    showCard({
      marketplace: work.marketplace,
      item: itemName(work),
      state: 'working',
      heading: `Listing on ${name}`,
      message: `Listed on ${name}. Finding the link to it…`,
    });
    report({ type: 'assist:posted', job_id: work.job_id, url });
    return result;
  }
  if (result.retry && !stopped) {
    // The site's server failed, not the form: the background tries a fresh form.
    progressPanel(work, `${result.error ?? `${name}’s server had a problem.`} pileGo will try again.`);
    return result;
  }
  if (stopped) {
    report({ type: 'assist:gave-up', job_id: work.job_id, message: `You stopped pileGo on ${name}.` });
    closePanel();
    return result;
  }
  const why = [
    result.error ?? '',
    result.missing.length ? `pileGo could not fill ${result.missing.join(', ')}.` : '',
    `Finish the ${name} form in this tab and post it.`,
  ]
    .filter(Boolean)
    .join(' ');
  report({ type: 'assist:stuck', job_id: work.job_id, message: why });
  const rows = work.listing.fields.map(f => ({ label: f.label, value: f.value, done: result.filled.includes(f.key) }));
  showCard({
    marketplace: work.marketplace,
    item: itemName(work),
    state: 'needs',
    heading: 'Needs you',
    message: why,
    rows,
    primary: { label: 'I’ve posted it', onClick: () => { stopAddressFill(); report({ type: 'assist:posted', job_id: work.job_id, url: null }); closePanel(); } },
    secondary: { label: 'Stop', onClick: () => { stopAddressFill(); report({ type: 'assist:gave-up', job_id: work.job_id, message: `You stopped the ${name} form.` }); closePanel(); } },
  });
  return result;
}

// ---------------------------------------------------------------------------
// Other sites: fill what can be found, the seller posts.
// ---------------------------------------------------------------------------

let filling: string | null = null;

async function startFill(work: ListingWork): Promise<FillResult> {
  // The same job sent twice (a retry after a slow load) must not fill twice.
  if (filling === work.job_id) return { ok: false, filled: [], missing: [], photos: 0, posted: false, error: 'Already filling.' };
  const driver = DRIVERS[work.marketplace];
  // Posting moves the tab to the new listing or the seller's closet; a fill
  // that arrives there is a stale resend, not a new listing.
  const site = SITES[work.marketplace];
  if (driver && site && !site.sellPage.test(location.href)) {
    return { ok: false, filled: [], missing: [], photos: 0, posted: false, error: 'Not on the sell page.' };
  }
  filling = work.job_id;
  stopAddressFill();
  stopAddressFill = watchSellerAddress(document, work.seller_address);
  try {
    const result = driver ? await runDriver(work, driver) : await assistFill(work);
    if (result.posted || stopped) stopAddressFill();
    return result;
  } catch (err) {
    stopAddressFill();
    throw err;
  } finally {
    filling = null;
  }
}

async function assistFill(work: ListingWork): Promise<FillResult> {
  const name = MARKETPLACES[work.marketplace].name;
  const posted: CardAction = { label: 'I’ve posted it', onClick: () => { stopAddressFill(); report({ type: 'assist:posted', job_id: work.job_id, url: null }); closePanel(); } };
  const stopIt: CardAction = { label: 'Stop', onClick: () => { stopAddressFill(); report({ type: 'assist:gave-up', job_id: work.job_id, message: `You stopped the ${name} form.` }); closePanel(); } };
  resetCard();
  showCard({ marketplace: work.marketplace, item: itemName(work), state: 'working', heading: `Filling ${name}`, message: 'Adding photos and filling the form…', primary: posted, secondary: stopIt });
  const { filled, photos } = await fill(work);
  const rows = work.listing.fields.map(f => ({ label: f.label, value: f.value, done: filled.includes(f.key as FieldKey) }));
  if (work.listing.description) rows.push({ label: 'Description', value: work.listing.description, done: filled.includes('description') });
  const left = rows.filter(r => !r.done).map(r => r.label.toLowerCase());
  showCard({
    marketplace: work.marketplace,
    item: itemName(work),
    state: 'needs',
    heading: 'Check it, then post',
    message: [
      photos ? `Added ${photos} ${photos === 1 ? 'photo' : 'photos'}.` : 'Add the photos: pileGo could not reach the upload button.',
      filled.length ? `Filled ${filled.length} ${filled.length === 1 ? 'field' : 'fields'}.` : '',
      left.length ? `Pick ${left.slice(0, 4).join(', ')} yourself; copy them from here.` : '',
      `Then press ${name}’s own button to publish.`,
    ]
      .filter(Boolean)
      .join(' '),
    rows,
    primary: posted,
    secondary: stopIt,
  });
  return { ok: true, filled, missing: [], photos, posted: false };
}

function startRemoval(work: ListingWork, reason: string) {
  const name = MARKETPLACES[work.marketplace].name;
  showCard({
    marketplace: work.marketplace,
    item: itemName(work),
    state: 'needs',
    heading: `Take it down on ${name}`,
    message: `${reason} Delete this listing or mark it sold on ${name}, then press Done.`,
    rows: [{ label: 'Item', value: work.listing.title || work.item.sku }],
    primary: { label: 'Done, it’s gone', onClick: () => { report({ type: 'assist:removed', job_id: work.job_id }); closePanel(); } },
    secondary: { label: 'Not now', onClick: () => { report({ type: 'assist:gave-up', job_id: work.job_id, message: `Still live on ${name}. Remove it by hand.` }); closePanel(); } },
  });
}

/** The card the background keeps for this tab, drawn on whatever page the tab is on now. */
function showView(view: OverlayView | null) {
  if (!view) {
    if (!filling) closePanel();
    return;
  }
  // The page's own driver is drawing its steps.
  if (filling && view.state === 'working') return;
  const name = MARKETPLACES[view.marketplace].name;
  showCard({
    marketplace: view.marketplace,
    item: view.title,
    state: view.state,
    heading: view.state === 'done' ? `Listed on ${name}` : view.state === 'needs' ? 'Needs you' : `Listing on ${name}`,
    message: view.step,
    link: view.link ?? null,
    secondary: view.state === 'working' ? undefined : { label: 'Close', onClick: closePanel },
  });
}

type FindRequest = Extract<AssistRequest, { type: 'assist:find' }>;

/** Read a page of this site, for checking which product it is. */
async function pageText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { credentials: 'include' });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

/**
 * The new listing's link on this page, or failing that where to look next:
 * the seller's own shop, newest first.
 */
async function locate(msg: FindRequest): Promise<{ url: string | null; shop: string | null }> {
  const wants = [msg.title, ...(msg.titles ?? [])].filter(Boolean);
  const ranked = await waitFor(() => {
    const hits = rankListings(msg.marketplace, document, wants, msg.exclude ?? [], msg.since);
    return hits.length ? hits : null;
  }, msg.wait ?? 8000, 400);
  if (ranked) {
    if (!msg.product_id) return { url: ranked[0]!.url, shop: null };
    // Depop said which product it made: check the likeliest few pages say the same.
    let read = 0;
    for (const hit of ranked.slice(0, 4)) {
      const page = await pageText(hit.url);
      if (page == null) continue;
      read += 1;
      if (pageIsProduct(page, msg.product_id)) return { url: hit.url, shop: null };
    }
    if (!read) return { url: ranked[0]!.url, shop: null };
  }
  const shop = shopUrl(msg.marketplace, document);
  const here = location.href.split(/[?#]/)[0];
  return { url: null, shop: shop && shop !== here ? shop : null };
}

ext.runtime.onMessage.addListener((msg: AssistRequest, _sender, reply) => {
  if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('assist:')) return false;
  if (msg.type === 'assist:ping') {
    reply({ ok: true, url: location.href, error: pageError() });
    return false;
  }
  if (msg.type === 'assist:find') {
    locate(msg).then(reply, () => reply({ url: null, shop: null }));
    return true;
  }
  if (msg.type === 'assist:overlay') {
    showView(msg.view);
    reply({ ok: true });
    return false;
  }
  if (msg.type === 'assist:remove') {
    startRemoval(msg.work, msg.reason);
    reply({ ok: true });
    return false;
  }
  if (msg.type === 'assist:comps') {
    // A search the background opened to read prices: wait for the cards to draw.
    const market = msg.market;
    waitFor(() => readComps(document, market).length > 0, 15_000)
      // The first cards draw before the rest.
      .then(() => sleep(1500))
      .then(() => reply({ comps: readComps(document, market) }));
    return true;
  }
  startFill(msg.work).then(
    r => reply(r),
    err => reply({ ok: false, error: String(err) }),
  );
  return true;
});

// A page that loads while this tab is listing (the new listing, the seller's
// shop) picks the card up where the last page left it.
void send<{ view?: OverlayView | null }>({ type: 'assist:hello' }).then(r => {
  if (r?.view && !cardShown()) showView(r.view);
});
