// Runs on the sell pages of Depop, Poshmark, Mercari and Grailed. It fills
// every field and presses the site's own post button, with a few seconds to
// press Stop first.

import { MARKETPLACES, type MarketplaceId } from '@pilego/core';
import { ext, fromBase64, send, sleep } from '../shared/browser.ts';
import type { AssistProgress, AssistReport, AssistRequest, FillResult, ListingWork } from '../shared/messages.ts';
import { readComps } from './comps.ts';
import { watchSellerAddress } from './seller-address.ts';
import { fillDepop } from './depop.ts';
import { norm, pageError, text, waitFor } from './dom.ts';
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
// The panel. Shadow DOM, so the site's styles and ours leave each other alone.
// ---------------------------------------------------------------------------

const CSS = `
:host { all: initial; }
.card { position: fixed; z-index: 2147483646; right: 16px; bottom: 16px; width: min(340px, calc(100vw - 32px));
  max-height: min(70vh, 560px); display: flex; flex-direction: column; background: #F6F6F1; color: #16172B;
  border-radius: 14px; box-shadow: 0 2px 0 #16172B, 0 18px 40px rgba(22,23,43,.28); font: 14px/1.4 ui-sans-serif, system-ui, sans-serif;
  border: 2px solid #16172B; overflow: hidden; }
.head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #2B3FE8; color: #F6F6F1; }
.tag { display: inline-block; background: #FF4F9A; color: #16172B; font-weight: 800; padding: 2px 8px 2px 12px; border-radius: 3px 6px 6px 3px;
  clip-path: polygon(8px 0, 100% 0, 100% 100%, 8px 100%, 0 50%); transform: rotate(-4deg); }
.head b { font-size: 15px; }
.x { margin-left: auto; background: none; border: 0; color: inherit; font-size: 18px; cursor: pointer; padding: 2px 6px; }
.body { padding: 12px; overflow: auto; display: flex; flex-direction: column; gap: 10px; }
.msg { margin: 0; }
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; background: #fff; border-radius: 8px; }
li span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
li small { display: block; color: #5b5c70; font-size: 11px; }
li.done { opacity: .6; }
button.copy { flex: none; border: 1.5px solid #16172B; background: #fff; color: #16172B; border-radius: 999px; padding: 3px 10px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
.foot { display: flex; gap: 8px; padding: 10px 12px; border-top: 1.5px dashed #c9c9c0; }
.foot button { flex: 1; border-radius: 999px; padding: 8px 10px; font: inherit; font-weight: 700; cursor: pointer; border: 2px solid #16172B; }
.go { background: #FF4F9A; color: #16172B; }
.no { background: transparent; color: #16172B; }
button:focus-visible { outline: 3px solid #FFE14D; outline-offset: 2px; }
`;

let panelHost: HTMLElement | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: Array<Node | string>) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function closePanel() {
  panelHost?.remove();
  panelHost = null;
}

function panel(opts: {
  title: string;
  message: string;
  rows: Array<{ label: string; value: string; done?: boolean }>;
  go: string;
  no: string;
  onGo: () => void;
  onNo: () => void;
}) {
  closePanel();
  panelHost = document.createElement('pilego-panel');
  const root = panelHost.attachShadow({ mode: 'closed' });
  root.append(el('style', { textContent: CSS }));
  const close = el('button', { className: 'x', textContent: '×', title: 'Hide' });
  close.setAttribute('aria-label', 'Hide the pileGo panel');
  close.addEventListener('click', closePanel);
  const list = el('ul');
  for (const row of opts.rows) {
    const copy = el('button', { className: 'copy', textContent: 'Copy' });
    copy.addEventListener('click', async () => {
      await navigator.clipboard.writeText(row.value).catch(() => {});
      copy.textContent = 'Copied';
      setTimeout(() => (copy.textContent = 'Copy'), 1400);
    });
    list.append(el('li', { className: row.done ? 'done' : '' }, el('span', {}, el('small', { textContent: row.done ? `${row.label}, filled in` : row.label }), row.value), copy));
  }
  const go = el('button', { className: 'go', textContent: opts.go });
  go.addEventListener('click', () => {
    opts.onGo();
    closePanel();
  });
  const no = el('button', { className: 'no', textContent: opts.no });
  no.addEventListener('click', () => {
    opts.onNo();
    closePanel();
  });
  const card = el(
    'div',
    { className: 'card' },
    el('div', { className: 'head' }, el('span', { className: 'tag', textContent: 'pileGo' }), el('b', { textContent: opts.title }), close),
    el('div', { className: 'body' }, el('p', { className: 'msg', textContent: opts.message }), opts.rows.length ? list : ''),
    el('div', { className: 'foot' }, go, no),
  );
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', `pileGo: ${opts.title}`);
  root.append(card);
  document.documentElement.append(panelHost);
}

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

function progressPanel(work: ListingWork, message: string) {
  const name = MARKETPLACES[work.marketplace].name;
  panel({
    title: `Listing on ${name}`,
    message,
    rows: [],
    go: 'Hide',
    no: 'Stop',
    onGo: () => {},
    onNo: () => {
      stopped = true;
      stopAddressFill();
    },
  });
}

async function runDriver(work: ListingWork, driver: Driver): Promise<FillResult> {
  const name = MARKETPLACES[work.marketplace].name;
  stopped = false;
  let shownStep = '';
  const ctx: DriverContext = {
    step(message) {
      shownStep = message;
      if (panelHost) progressPanel(work, message);
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
    closePanel();
    // Some sites land on the closet or feed instead of the new listing: find it there.
    const url = postedListing(work.marketplace, location.href)
      ? location.href
      : ((await waitFor(() => findListing(work.marketplace, work.listing.title || work.listing.description), 5000)) ?? location.href);
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
  panel({
    title: 'Needs you',
    message: why,
    rows,
    go: 'I’ve posted it',
    no: 'Stop',
    onGo: () => { stopAddressFill(); report({ type: 'assist:posted', job_id: work.job_id, url: null }); },
    onNo: () => { stopAddressFill(); report({ type: 'assist:gave-up', job_id: work.job_id, message: `You stopped the ${name} form.` }); },
  });
  return result;
}

/** The new listing's link on a closet or feed page, matched by its title. */
function findListing(market: MarketplaceId, title: string): string | null {
  const site = SITES[market];
  const want = norm(title).slice(0, 40).trim();
  if (!site || want.length < 4) return null;
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const hit = postedListing(market, a.href);
    if (!hit) continue;
    let path = '';
    try {
      path = new URL(a.href).pathname;
    } catch {
      continue;
    }
    // The card's text, its photo's alt text, or the slug in the address all carry the title.
    const words = norm(`${text(a)} ${a.title} ${a.querySelector('img')?.alt ?? ''} ${path}`);
    if (` ${words} `.includes(` ${want}`)) return hit.url;
  }
  return null;
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
  panel({
    title: `Filling ${name}`,
    message: 'Adding photos and filling the form…',
    rows: [],
    go: 'I’ve posted it',
    no: 'Stop',
    onGo: () => { stopAddressFill(); report({ type: 'assist:posted', job_id: work.job_id, url: null }); },
    onNo: () => { stopAddressFill(); report({ type: 'assist:gave-up', job_id: work.job_id, message: `You stopped the ${name} form.` }); },
  });
  const { filled, photos } = await fill(work);
  const rows = work.listing.fields.map(f => ({ label: f.label, value: f.value, done: filled.includes(f.key as FieldKey) }));
  if (work.listing.description) rows.push({ label: 'Description', value: work.listing.description, done: filled.includes('description') });
  const left = rows.filter(r => !r.done).map(r => r.label.toLowerCase());
  panel({
    title: `Check it, then post`,
    message: [
      photos ? `Added ${photos} ${photos === 1 ? 'photo' : 'photos'}.` : 'Add the photos: pileGo could not reach the upload button.',
      filled.length ? `Filled ${filled.length} ${filled.length === 1 ? 'field' : 'fields'}.` : '',
      left.length ? `Pick ${left.slice(0, 4).join(', ')} yourself; copy them from here.` : '',
      `Then press ${name}’s own button to publish.`,
    ]
      .filter(Boolean)
      .join(' '),
    rows,
    go: 'I’ve posted it',
    no: 'Stop',
    onGo: () => { stopAddressFill(); report({ type: 'assist:posted', job_id: work.job_id, url: null }); },
    onNo: () => { stopAddressFill(); report({ type: 'assist:gave-up', job_id: work.job_id, message: `You stopped the ${name} form.` }); },
  });
  return { ok: true, filled, missing: [], photos, posted: false };
}

function startRemoval(work: ListingWork, reason: string) {
  const name = MARKETPLACES[work.marketplace].name;
  panel({
    title: `Take it down on ${name}`,
    message: `${reason} Delete this listing or mark it sold on ${name}, then press Done.`,
    rows: [{ label: 'Item', value: work.listing.title || work.item.sku }],
    go: 'Done, it’s gone',
    no: 'Not now',
    onGo: () => report({ type: 'assist:removed', job_id: work.job_id }),
    onNo: () => report({ type: 'assist:gave-up', job_id: work.job_id, message: `Still live on ${name}. Remove it by hand.` }),
  });
}

ext.runtime.onMessage.addListener((msg: AssistRequest, _sender, reply) => {
  if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('assist:')) return false;
  if (msg.type === 'assist:ping') {
    reply({ ok: true, url: location.href, error: pageError() });
    return false;
  }
  if (msg.type === 'assist:find') {
    waitFor(() => findListing(msg.marketplace, msg.title), 8000).then(url => reply({ url }));
    return true;
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
