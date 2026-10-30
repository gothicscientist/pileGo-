// Genuine pileGo! UI captures for the launch film. Everything on screen is the
// real app; only the network is faked (apps/web/e2e/fixtures.ts plus a few
// stateful route mocks below so the success paths render as the code expects).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { mockSupabase, SUPABASE, UID } from '../../apps/web/e2e/fixtures';

const OUT = fileURLToPath(new URL('../public/ui/', import.meta.url));
const SCHEME = process.env.CAPTURE_SCHEME === 'light' ? 'light' : 'dark';
const PHOTOS = fileURLToPath(new URL('./photos/', import.meta.url));
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

// ---------------------------------------------------------------------------
// The hero garment: what the AI reads off the rust bomber photos.
// ---------------------------------------------------------------------------

const DESCRIPTION =
  'A rust satin bomber with a ribbed collar, cuffs and hem, and a zip utility pocket on the left sleeve. ' +
  'The soft sheen catches the light without being loud, and it layers easily over a hoodie. ' +
  'Roomy through the body with a classic bomber length.';

const SCAN = {
  title: 'Rust satin bomber jacket',
  brand: null,
  department: 'men',
  category: 'outerwear',
  subcategory: 'jackets',
  size: 'L',
  size_system: 'letter',
  colors: ['rust', 'brown'],
  materials: ['polyester', 'nylon lining'],
  condition: 'excellent',
  flaws: null,
  era: 'Y2K',
  style_tags: ['bomber', 'streetwear', 'y2k'],
  description: DESCRIPTION,
  keywords: ['bomber jacket', 'satin bomber', 'rust jacket', 'flight jacket', 'y2k jacket', 'mens bomber'],
  price: { low: 30, high: 52, suggested: 38, currency: 'USD' },
  measurements_to_take: ['pit_to_pit', 'length', 'shoulder', 'sleeve'],
  estimated_measurements: { unit: 'in', basis: 'Size L on a standard US chart', pit_to_pit: 23, length: 26, shoulder: 19.5, sleeve: 25 },
  confidence: 0.92,
  notes: null,
};

type HeroPhase = 'fresh' | 'queued' | 'progress';

interface State {
  hero: HeroPhase;
  queued: string[];
  relists: Array<Record<string, unknown>>;
  rawItems: Array<Record<string, any>>;
  rawJobs: Array<Record<string, any>>;
}

function heroListing(m: string, status: string, price: number) {
  return {
    id: `a2-new-${m}`, user_id: UID, item_id: 'a2', marketplace: m, status,
    external_id: status === 'listed' ? `${m}-a2` : null,
    external_url: status === 'listed' ? `https://example.com/${m}/a2` : null,
    title: null, price: String(price), payload: {}, error: null,
    listed_at: status === 'listed' ? iso(0.02) : null, last_synced_at: null, relist_count: 0,
    created_at: iso(0.03), updated_at: iso(0.02),
  };
}

function heroJob(m: string, status: string) {
  return {
    id: `job-a2-${m}`, user_id: UID, kind: 'publish', runner: m === 'ebay' ? 'server' : 'extension', marketplace: m,
    item_id: 'a2', listing_id: `a2-new-${m}`, status, payload: {}, result: null, error: null, attempts: status === 'running' ? 1 : 0,
    run_after: iso(0.03), created_at: iso(0.03), updated_at: iso(0.02),
  };
}

function items(s: State) {
  return s.rawItems.map(it => {
    if (it.id !== 'a2') return it;
    const markets = s.queued.length ? s.queued : ['ebay', 'vinted', 'depop', 'poshmark'];
    const listings =
      s.hero === 'fresh'
        ? []
        : markets.map(m =>
            heroListing(m, s.hero === 'queued' ? 'queued' : m === 'ebay' ? 'listed' : m === 'vinted' ? 'publishing' : 'queued', 30),
          );
    return {
      ...it,
      title: SCAN.title,
      brand: null,
      status: s.hero === 'progress' ? 'listed' : 'ready',
      department: 'men',
      size: 'L',
      size_system: 'letter',
      colors: SCAN.colors,
      materials: SCAN.materials,
      condition: 'excellent',
      era: 'Y2K',
      style_tags: SCAN.style_tags,
      description: DESCRIPTION,
      // What the review saves: the price picker's Balanced tier for this scan ($30).
      price: '30',
      cost: '9',
      measurements: { unit: 'in', pit_to_pit: 23, length: 26, shoulder: 19.5, sleeve: 25, estimated: ['pit_to_pit', 'length', 'shoulder', 'sleeve'] },
      ai: SCAN,
      created_at: iso(0.05),
      updated_at: iso(0.03),
      listings,
    };
  });
}

function jobs(s: State) {
  const others = s.rawJobs.filter(j => j.item_id !== 'a2');
  const markets = s.queued.length ? s.queued : ['ebay', 'vinted', 'depop', 'poshmark'];
  const hero =
    s.hero === 'fresh'
      ? []
      : s.hero === 'queued'
        ? markets.map(m => heroJob(m, 'pending'))
        : markets.filter(m => m !== 'ebay').map(m => heroJob(m, m === 'vinted' ? 'running' : 'pending'));
  return [...others, ...hero, ...s.relists];
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: CORS });

/** The fixture's fake Supabase, plus stateful overrides for the hero item, publishing and relisting. */
async function setup(page: Page, opts: { hero?: HeroPhase; extension?: boolean; scanDelay?: number } = {}) {
  await mockSupabase(page);
  const s: State = { hero: opts.hero ?? 'fresh', queued: [], relists: [], rawItems: [], rawJobs: [] };
  // The film is dark; CAPTURE_SCHEME=light captures the light theme instead.
  await page.addInitScript(theme => {
    localStorage.setItem('pilego-cutouts', 'off');
    localStorage.setItem('pilego-theme', theme);
  }, SCHEME);
  if (opts.extension) {
    // Stands in for the installed, linked browser extension's content script.
    await page.addInitScript(uid => {
      window.addEventListener('message', e => {
        if (e.data?.source !== 'pilego-app') return;
        if (!['hello', 'run-jobs'].includes(e.data.type)) return;
        window.postMessage({ source: 'pilego-ext', type: 'status', status: {
          version: '1.0.0', installed: true, linked: true, needs_approval: false, user_id: uid, tabs: {}, running: 0,
          ...(e.data.type === 'run-jobs' ? { jobs_accepted: e.data.request_id } : {}),
        } }, location.origin);
      });
    }, UID);
  }
  await page.route(`${SUPABASE}/rest/v1/**`, async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS' || url.searchParams.has('capture_raw')) return route.fallback();
    const path = url.pathname;
    const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    if (path.startsWith('/rest/v1/items') && req.method() === 'GET' && s.rawItems.length) {
      const list = items(s);
      const id = url.searchParams.get('id')?.replace('eq.', '');
      if (id) {
        const it = list.find(i => i.id === id) ?? null;
        return json(route, single ? it : it ? [it] : []);
      }
      return json(route, list);
    }
    if (path.startsWith('/rest/v1/jobs') && req.method() === 'GET' && s.rawItems.length) return json(route, jobs(s));
    if (path === '/rest/v1/rpc/queue_publish') {
      const body = req.postDataJSON() as { p_marketplaces: string[] };
      await new Promise(r => setTimeout(r, 700));
      s.queued = body.p_marketplaces;
      s.hero = 'queued';
      return json(route, body.p_marketplaces.map(m => heroListing(m, 'queued', 30)));
    }
    if (path === '/rest/v1/rpc/queue_listing_job') {
      const body = req.postDataJSON() as { p_listing_id: string; p_kind: string };
      await new Promise(r => setTimeout(r, 1100));
      const listing = s.rawItems.flatMap(i => i.listings as Array<Record<string, any>>).find(l => l.id === body.p_listing_id);
      const job = {
        id: `relist-${body.p_listing_id}`, user_id: UID, kind: body.p_kind, runner: listing?.marketplace === 'ebay' ? 'server' : 'extension',
        marketplace: listing?.marketplace, item_id: listing?.item_id, listing_id: body.p_listing_id, status: 'pending', payload: {},
        result: null, error: null, attempts: 0, run_after: iso(0), created_at: iso(0), updated_at: iso(0),
      };
      s.relists.push(job);
      return json(route, job);
    }
    return route.fallback();
  });
  if (opts.scanDelay != null) {
    await page.route(`${SUPABASE}/functions/v1/scan-item`, async route => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      await new Promise(r => setTimeout(r, opts.scanDelay));
      return json(route, SCAN);
    });
  }
  // Read the fixture's own rows once, so the overrides build on them.
  await page.goto('/privacy');
  const raw = await page.evaluate(async base => {
    const get = (t: string) => fetch(`${base}/rest/v1/${t}?select=*&capture_raw=1`).then(r => r.json());
    return { items: await get('items'), jobs: await get('jobs') };
  }, SUPABASE);
  s.rawItems = raw.items;
  s.rawJobs = raw.jobs;
  return s;
}

// ---------------------------------------------------------------------------
// Screenshot helpers
// ---------------------------------------------------------------------------

async function settle(page: Page, ms = 800) {
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map(img =>
        img.complete ? img.decode().catch(() => undefined) : new Promise(r => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); }),
      ),
    );
  });
  await page.mouse.move(1439, 899);
  await page.waitForTimeout(ms);
}

async function toTop(page: Page, top = 0) {
  await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior }), top);
  await page.waitForTimeout(250);
}

async function shot(page: Page, name: string, anim: 'allow' | 'disabled' = 'disabled') {
  await page.screenshot({ path: `${OUT}${name}`, animations: anim, caret: 'hide' });
}

async function crop(el: Locator, name: string, anim: 'allow' | 'disabled' = 'disabled') {
  await el.screenshot({ path: `${OUT}${name}`, animations: anim, caret: 'hide' });
}

async function addPhoto(page: Page, slot: 'front' | 'back' | 'label') {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: new RegExp(`Add the ${slot} photo`) }).click();
  await (await chooser).setFiles({ name: `${slot}.jpg`, mimeType: 'image/jpeg', buffer: readFileSync(`${PHOTOS}${slot}.jpg`) });
}

// ---------------------------------------------------------------------------
// 1-4. Scan
// ---------------------------------------------------------------------------

test('scan: empty, photos in, countdown, scanning, review', async ({ page }) => {
  await setup(page, { scanDelay: 10_000 });
  await page.goto('/scan');
  await expect(page.getByRole('heading', { name: 'Scan an item' })).toBeVisible();
  await expect(page.getByTestId('shot-count')).toHaveText('0 of 3');
  await settle(page, 1000);
  await shot(page, 'scan-empty.png');
  await crop(page.locator('section[aria-labelledby="key-photos"]'), 'scan-empty-slots.png');

  await addPhoto(page, 'front');
  await expect(page.getByTestId('shot-count')).toHaveText('1 of 3');
  await toTop(page);
  await settle(page, 600);
  await shot(page, 'scan-photos-1of3.png');
  await addPhoto(page, 'back');
  await expect(page.getByTestId('shot-count')).toHaveText('2 of 3');
  await addPhoto(page, 'label');
  // The three key shots are in: the scan counts down by itself.
  await expect(page.getByTestId('auto-scan')).toContainText('Scanning in 3');
  await toTop(page, 0);
  await page.mouse.move(1439, 899);
  await page.waitForTimeout(450);
  await shot(page, 'scan-countdown-3.png');
  await expect(page.getByTestId('auto-scan')).toContainText('Scanning in 2');
  await page.waitForTimeout(150);
  await shot(page, 'scan-countdown-2.png');
  await crop(page.getByTestId('auto-scan'), 'scan-countdown-bar.png');
  await expect(page.getByTestId('auto-scan')).toContainText('Scanning in 1');
  await page.waitForTimeout(150);
  await shot(page, 'scan-countdown-1.png');

  // Scanning: the scan-item response is held back 10 s.
  const status = page.getByRole('status').filter({ hasText: 'Reading your photos' });
  await expect(status).toBeVisible();
  const t0 = Date.now();
  const at = async (ms: number) => page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
  await at(1600);
  await shot(page, 'scan-loading-1.png', 'allow');
  await at(4300);
  await shot(page, 'scan-loading-2.png', 'allow');
  await at(8600);
  await shot(page, 'scan-loading-3.png', 'allow');
  await crop(status, 'scan-loading-notes.png', 'allow');
  await crop(page.locator('section[aria-labelledby="key-photos"]').locator('xpath=..'), 'scan-loading-photo.png', 'allow');
  await page.waitForTimeout(300);
  await shot(page, 'scan-loading.png', 'allow');

  // Review.
  await expect(page.getByRole('heading', { name: 'Check it over' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('Title')).toHaveValue('Rust satin bomber jacket');
  await toTop(page);
  await settle(page, 1200);
  await shot(page, 'scan-review-1.png');
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  let n = 2;
  for (let y = 700; y < total - 900 + 700; y += 700) {
    await page.evaluate(top => window.scrollTo({ top, behavior: 'instant' as ScrollBehavior }), Math.min(y, total - 900));
    await page.waitForTimeout(400);
    await shot(page, `scan-review-${n++}.png`);
    if (y >= total - 900) break;
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
  await page.waitForTimeout(300);
  // The photo column stretches to the form's height; clip it to the cover and the slots.
  const coverBox = (await page.getByAltText('Cover photo').locator('xpath=..').boundingBox())!;
  const slotsBox = (await page.locator('section[aria-labelledby="key-photos"]').boundingBox())!;
  await page.screenshot({
    path: `${OUT}scan-review-photos.png`, caret: 'hide', animations: 'disabled', fullPage: true,
    clip: { x: coverBox.x - 12, y: coverBox.y - 12, width: coverBox.width + 24, height: slotsBox.y + slotsBox.height - coverBox.y + 24 },
  });
  // Hide the sticky save bar so the form crops read as one clean sheet (capture-only style).
  const hideBar = await page.addStyleTag({ content: 'div.sticky:has(> button), div.sticky:has(button) { visibility: hidden !important; }' });
  const form = page.getByLabel('Title').locator('xpath=ancestor::div[contains(@class,"flex-col") and contains(@class,"gap-6")][1]');
  await crop(form, 'scan-review-form.png');
  await crop(form.locator('xpath=..'), 'scan-review-sheet.png');
  await crop(form.locator('xpath=./div[1]'), 'scan-review-fields-title.png');
  await crop(page.locator('fieldset').filter({ hasText: 'Measurements' }), 'scan-review-measurements.png');
  await crop(page.getByRole('heading', { name: 'Price', exact: true }).locator('xpath=ancestor::section[1]'), 'scan-review-price.png');
  await crop(page.locator('fieldset').filter({ hasText: 'Measurements' }).locator('xpath=following-sibling::*[1]'), 'scan-review-description.png');
  await crop(form.locator('xpath=./div[contains(@class,"sm:grid-cols-2")][2]'), 'scan-review-colours-materials.png');
  await hideBar.evaluate(el => el.remove());
  await toTop(page, 100_000);
  await page.mouse.move(1439, 899);
  const save = page.getByRole('button', { name: 'Save and cross-list' }).locator('xpath=..');
  await crop(save, 'scan-review-savebar.png');
});

test('scan: all three photos in, held for more', async ({ page }) => {
  await setup(page);
  await page.goto('/scan');
  await expect(page.getByTestId('shot-count')).toHaveText('0 of 3');
  for (const slot of ['front', 'back', 'label'] as const) await addPhoto(page, slot);
  await expect(page.getByTestId('auto-scan')).toContainText('Scanning in');
  await page.getByRole('button', { name: 'Wait, I’m adding more' }).click();
  await expect(page.getByTestId('auto-scan')).toHaveCount(0);
  await expect(page.getByTestId('shot-count')).toHaveText('3 of 3');
  await expect(page.getByRole('button', { name: 'Scan with AI' })).toBeEnabled();
  await toTop(page);
  await settle(page, 1000);
  await shot(page, 'scan-photos.png');
  await toTop(page, 10_000);
  await shot(page, 'scan-photos-scrolled.png');
  await toTop(page);
  await crop(page.locator('section[aria-labelledby="key-photos"]'), 'scan-photos-slots.png');
  await crop(page.locator('section[aria-labelledby="key-photos"]').locator('xpath=..'), 'scan-photos-column.png');
  await crop(page.getByRole('button', { name: 'Scan with AI' }), 'scan-button.png');
});

// ---------------------------------------------------------------------------
// 5-6. Item page and cross-list
// ---------------------------------------------------------------------------

const MARKETS = [
  ['ebay', 'eBay'],
  ['vinted', 'Vinted'],
  ['depop', 'Depop'],
  ['poshmark', 'Poshmark'],
] as const;

test('item page and cross-list for the rust bomber', async ({ page }) => {
  const s = await setup(page, { hero: 'fresh', extension: true });
  await page.goto('/item/a2');
  await expect(page.getByRole('heading', { name: 'Rust satin bomber jacket' })).toBeVisible();
  await settle(page, 1000);
  await shot(page, 'item-page-bomber.png');
  await page.getByRole('tab', { name: 'Listings' }).click();
  await expect(page.getByText('Not listed anywhere yet')).toBeVisible();
  await settle(page, 600);
  await shot(page, 'item-listings-bomber-before.png');

  await page.getByRole('button', { name: 'Cross-list' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Cross-list', exact: true });
  await expect(sheet.getByRole('button', { name: 'List on 4 marketplaces', exact: true })).toBeVisible();
  await settle(page, 1000);
  await shot(page, 'crosslist-sheet.png');
  await crop(sheet, 'crosslist-dialog.png');
  const bodyTop = () => sheet.locator('div.overflow-y-auto').first().evaluate(el => { el.scrollTop = 0; });
  const card = (name: string) => sheet.locator('li').filter({ has: page.locator('button[aria-pressed]') }).filter({ hasText: name });
  await crop(sheet.locator('ul').filter({ has: page.locator('button[aria-pressed]') }).first().locator('xpath=..'), 'crosslist-picker.png');
  for (const [id, name] of MARKETS) await crop(card(name), `crosslist-card-${id}.png`);
  await crop(sheet.getByRole('button', { name: 'List on 4 marketplaces', exact: true }), 'crosslist-list-button.png');
  await crop(sheet.locator('footer'), 'crosslist-footer.png');
  await crop(sheet.getByRole('tablist', { name: 'Preview for' }), 'crosslist-tabs.png');
  for (const [id, name] of MARKETS) {
    await sheet.getByRole('tab', { name, exact: true }).click();
    await page.waitForTimeout(700);
    await page.mouse.move(1439, 899);
    await crop(sheet.getByRole('tabpanel'), `crosslist-preview-${id}.png`);
    await bodyTop();
    await page.waitForTimeout(200);
    await shot(page, `crosslist-sheet-${id}.png`);
  }
  // Scroll the sheet body to the top again, eBay tab.
  await sheet.getByRole('tab', { name: 'eBay', exact: true }).click();

  // More marketplaces: Mercari and Grailed.
  await sheet.getByRole('button', { name: 'More marketplaces' }).click();
  await page.waitForTimeout(500);
  for (const name of ['Mercari', 'Grailed']) await card(name).getByRole('button').click();
  await expect(sheet.getByRole('button', { name: 'List on 6 marketplaces', exact: true })).toBeVisible();
  await bodyTop();
  await settle(page, 800);
  await shot(page, 'crosslist-sheet-6.png');
  await crop(sheet, 'crosslist-dialog-6.png');
  for (const name of ['Mercari', 'Grailed']) {
    await crop(card(name), `crosslist-card-${name.toLowerCase()}.png`);
    await sheet.getByRole('tab', { name, exact: true }).click();
    await page.waitForTimeout(700);
    await page.mouse.move(1439, 899);
    await crop(sheet.getByRole('tabpanel'), `crosslist-preview-${name.toLowerCase()}.png`);
  }
  await crop(sheet.getByRole('tablist', { name: 'Preview for' }), 'crosslist-tabs-6.png');
  // Back to the four in the seller's setup.
  for (const name of ['Mercari', 'Grailed']) await card(name).getByRole('button').click();
  await sheet.getByRole('button', { name: 'Only my marketplaces' }).click();
  await sheet.getByRole('tab', { name: 'eBay', exact: true }).click();
  const list = sheet.getByRole('button', { name: 'List on 4 marketplaces', exact: true });
  await expect(list).toBeVisible();
  await bodyTop();
  await page.waitForTimeout(500);

  // Send it. queue_publish answers after 0.7 s, so the busy state is visible.
  await list.click();
  await page.waitForTimeout(250);
  await shot(page, 'crosslist-sending.png', 'allow');
  await expect(sheet).not.toBeVisible();
  await expect(page.getByText('Sent to 4 marketplaces')).toBeVisible();
  await expect(page.getByText('In progress')).toBeVisible();
  await page.waitForTimeout(700);
  await shot(page, 'item-listings-after.png');
  const toast = page.getByText('Sent to 4 marketplaces');
  if (await toast.isVisible()) await crop(toast.locator('xpath=ancestor-or-self::*[@role="status" or @role="alert"][1]').or(toast).first(), 'toast-sent.png');
  await page.waitForTimeout(4500);
  await settle(page, 500);
  await shot(page, 'item-listings-queued.png');
  await crop(page.getByRole('tabpanel'), 'item-listings-queued-panel.png');

  // A minute later: eBay is live, Vinted is going up, the assisted ones wait their turn.
  s.hero = 'progress';
  await page.reload();
  await expect(page.getByText('In progress')).toBeVisible();
  await settle(page, 1000);
  await shot(page, 'item-listings-progress.png');
  await crop(page.getByRole('tabpanel'), 'item-listings-progress-panel.png');
});

test('cross-list without the extension installed', async ({ page }) => {
  await setup(page, { hero: 'fresh' });
  await page.goto('/item/a2?crosslist=1');
  const sheet = page.getByRole('dialog', { name: 'Cross-list', exact: true });
  await expect(sheet.getByRole('button', { name: 'List on 4 marketplaces', exact: true })).toBeVisible();
  await settle(page, 1000);
  await shot(page, 'crosslist-sheet-noext.png');
});

test('item page for the raw selvedge jeans', async ({ page }) => {
  await setup(page, { hero: 'queued' });
  await page.goto('/item/a1');
  await expect(page.getByRole('heading', { name: 'Raw selvedge straight jeans' })).toBeVisible();
  await settle(page, 1000);
  await shot(page, 'item-page.png');
  await page.getByRole('tab', { name: 'Listings' }).click();
  await expect(page.getByText('View on eBay')).toBeVisible();
  await settle(page, 600);
  await shot(page, 'item-listings.png');
  await page.getByRole('tab', { name: 'Price' }).click();
  await expect(page.getByText('Suggested price')).toBeVisible();
  await settle(page, 600);
  await shot(page, 'item-price.png');
});

// ---------------------------------------------------------------------------
// 7. Out there and relisting
// ---------------------------------------------------------------------------

test('out there and relist', async ({ page }) => {
  await setup(page, { hero: 'queued', extension: true });
  await page.goto('/out');
  await expect(page.getByRole('heading', { name: 'Live' })).toBeVisible();
  const relist = page.getByRole('button', { name: /Relist 3 old listings/ });
  await expect(relist).toBeVisible();
  await settle(page, 1000);
  await shot(page, 'out-there.png');
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  if (total > 1000) {
    await page.evaluate(top => window.scrollTo({ top, behavior: 'instant' as ScrollBehavior }), total - 900);
    await page.waitForTimeout(400);
    await shot(page, 'out-there-2.png');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
    await page.waitForTimeout(300);
  }
  const section = (name: string) => page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await crop(section('Needs you'), 'out-needs-you.png');
  if (await section('On the way').count()) await crop(section('On the way'), 'out-on-the-way.png');
  await crop(section('Live'), 'out-live.png');
  const rows = section('Live').locator('ul > li');
  const count = await rows.count();
  for (let i = 0; i < count; i++) await crop(rows.nth(i), `out-row-${i + 1}.png`);
  await crop(relist, 'out-relist-button.png');

  await relist.click();
  await expect(page.getByRole('button', { name: /Relisting 0 of 3/ })).toBeVisible();
  await page.waitForTimeout(300);
  await crop(page.getByRole('button', { name: /Relisting \d of 3/ }), 'out-relisting-button.png', 'allow');
  await expect(page.getByRole('button', { name: /Relisting 1 of 3/ })).toBeVisible();
  await page.waitForTimeout(200);
  await shot(page, 'out-relisting.png', 'allow');
  await expect(page.getByText('Relisting 3 listings')).toBeVisible({ timeout: 10_000 });
  await shot(page, 'out-after-relist-live.png');
  await toTop(page);
  await page.waitForTimeout(700);
  await page.mouse.move(1439, 899);
  await shot(page, 'out-after-relist.png');
  await page.waitForTimeout(4500);
  await settle(page, 500);
  await shot(page, 'out-after-relist-settled.png');
  if (await section('On the way').count()) await crop(section('On the way'), 'out-on-the-way-after-relist.png');
});

// ---------------------------------------------------------------------------
// 8. Closet
// ---------------------------------------------------------------------------

test('closet rack, table, bulk', async ({ page }) => {
  await setup(page, { hero: 'queued' });
  await page.goto('/closet');
  await expect(page.getByRole('heading', { name: 'Closet' })).toBeVisible();
  await expect(page.getByText('Colour block anorak')).toBeVisible();
  await settle(page, 1200);
  await shot(page, 'closet-rack.png');

  for (const t of ['Rust satin bomber jacket', 'Grey check flannel shirt', 'Cream baggy cargos']) {
    await page.getByRole('checkbox', { name: `Pick ${t}` }).click();
  }
  await expect(page.getByText('3 items picked')).toBeVisible();
  await settle(page, 900);
  await shot(page, 'closet-bulk.png');
  await crop(page.getByText('3 items picked').locator('xpath=..'), 'closet-bulk-bar.png');
  await page.getByText('3 items picked').locator('xpath=..').getByRole('button', { name: 'Cross-list' }).click();
  await page.waitForTimeout(900);
  await page.mouse.move(1439, 899);
  await shot(page, 'closet-bulk-crosslist.png');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Clear selection' }).click();

  await page.getByPlaceholder('Search brand, title, SKU, colour').fill('bomber');
  await expect(page.getByText('Colour block anorak')).toHaveCount(0);
  await settle(page, 800);
  await shot(page, 'closet-search-bomber.png');
  await page.getByPlaceholder('Search brand, title, SKU, colour').fill('');
  await page.getByLabel('Category').selectOption('outerwear');
  await settle(page, 800);
  await shot(page, 'closet-filter-outerwear.png');

  await page.goto('/closet?view=table');
  await expect(page.getByRole('table')).toBeVisible();
  await settle(page, 1000);
  await shot(page, 'closet-table.png');
});

// ---------------------------------------------------------------------------
// 9-10. Pile, sidebar, insights
// ---------------------------------------------------------------------------

test('pile and sidebar', async ({ page }) => {
  await setup(page, { hero: 'queued' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The pile' })).toBeVisible();
  await expect(page.getByText('Taken this month')).toBeVisible();
  await settle(page, 1800);
  await shot(page, 'pile.png');
  await crop(page.getByRole('complementary', { name: 'Summary' }), 'pile-summary.png');
  await crop(page.getByText('Taken this month').locator('xpath=ancestor::div[contains(@class,"receipt-edge")][1]'), 'pile-receipt.png');
  await crop(page.locator('aside').first(), 'sidebar.png');
  await crop(page.getByRole('region', { name: 'The pile' }).or(page.locator('section[aria-labelledby="pile-title"]')).first(), 'pile-stack.png');
});

test('insights', async ({ page }) => {
  await setup(page, { hero: 'queued' });
  await page.goto('/insights');
  await page.getByRole('button', { name: 'All time' }).click();
  await expect(page.getByText('Profit after fees and what you paid')).toBeVisible();
  await settle(page, 1500);
  await shot(page, 'insights.png');
});

// ---------------------------------------------------------------------------
// 11. Sign-in (repo) and the live site
// ---------------------------------------------------------------------------

test('signed-out sign-in page', async ({ page }) => {
  await mockSupabase(page, { signedIn: false });
  await page.addInitScript(() => localStorage.setItem('pilego-theme', 'light'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Clear the pile\. Keep the cash\./ })).toBeVisible();
  await settle(page, 1500);
  await shot(page, 'signin.png');
});

test('live site landing', async ({ browser }) => {
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  test.skip(!process.env.CAPTURE_LIVE, 'Set CAPTURE_LIVE=1 to capture https://pilego.app');
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
    ...(proxy ? { proxy: { server: proxy } } : {}),
  });
  const page = await ctx.newPage();
  await page.goto('https://pilego.app', { waitUntil: 'load', timeout: 60_000 });
  await settle(page, 2500);
  await shot(page, 'live-landing.png');
  await ctx.close();
});
