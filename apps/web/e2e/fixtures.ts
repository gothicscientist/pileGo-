// A fake Supabase for end-to-end tests and screenshots: a signed-in seller
// with a small closet, served by intercepting the app's network calls.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page, Route } from '@playwright/test';

export const SUPABASE = 'http://supabase.test';
export const UID = '00000000-0000-4000-8000-000000000001';

const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

type Art =
  | 'anorak' | 'banana-hoodie' | 'cap' | 'coffee-longsleeve' | 'cream-cargos' | 'denim-jacket'
  | 'flannel' | 'mesh-shorts' | 'mexico66-yellow' | 'navy-bomber' | 'pine-hoodie' | 'raw-selvedge'
  | 'rust-bomber' | 'shroud-selvedge' | 'white-tee';
type Print = 'banana-fit' | 'cargo-fit' | 'denim-pair' | 'grey-fit' | 'knit' | 'lilac-fit' | 'pine-fit' | 'selvedge-fit';

interface Seed {
  id: string;
  title: string;
  brand: string;
  /** A real cutout from src/assets/closet; without one the cover is a plain photo. */
  art: Art | null;
  /** The plain photo for covers without a cutout and for the second photo. */
  print: Print;
  category: string;
  subcategory: string;
  size: string;
  price: number | null;
  status: 'draft' | 'ready' | 'listed' | 'sold' | 'shipped';
  created: number;
  listings?: Array<{ m: string; status: string; days: number; price?: number }>;
  sold?: { days: number; price: number; m: string | null };
  cost?: number;
}

// Everyday pieces: mostly unbranded basics, denim and a few fun finds.
const SEEDS: Seed[] = [
  { id: 'a1', title: 'Raw selvedge straight jeans', brand: '', art: 'raw-selvedge', print: 'selvedge-fit', category: 'bottoms', subcategory: 'jeans', size: 'W30 L32', price: 45, status: 'listed', created: 48, cost: 8, listings: [{ m: 'ebay', status: 'listed', days: 41 }, { m: 'vinted', status: 'listed', days: 41 }] },
  { id: 'a2', title: 'Rust bomber jacket', brand: '', art: 'rust-bomber', print: 'cargo-fit', category: 'outerwear', subcategory: 'jackets', size: 'L', price: 38, status: 'listed', created: 20, cost: 9, listings: [{ m: 'depop', status: 'listed', days: 12 }, { m: 'ebay', status: 'queued', days: 0 }] },
  { id: 'a3', title: 'Heavyweight lilac hoodie', brand: '', art: null, print: 'lilac-fit', category: 'knitwear', subcategory: 'hoodies', size: 'M', price: null, status: 'draft', created: 1 },
  { id: 'a4', title: 'Grey check flannel shirt', brand: '', art: 'flannel', print: 'grey-fit', category: 'tops', subcategory: 'shirts', size: 'M', price: 24, status: 'ready', created: 3 },
  { id: 'a5', title: 'Cord collar denim jacket', brand: 'Lee', art: 'denim-jacket', print: 'denim-pair', category: 'outerwear', subcategory: 'denim-jackets', size: 'M', price: 55, status: 'sold', created: 60, cost: 15, listings: [{ m: 'vinted', status: 'sold', days: 30 }, { m: 'depop', status: 'delisted', days: 30 }], sold: { days: 2, price: 50, m: 'vinted' } },
  { id: 'a6', title: 'White crew neck tee', brand: '', art: 'white-tee', print: 'grey-fit', category: 'tops', subcategory: 't-shirts', size: 'S', price: 12, status: 'listed', created: 9, listings: [{ m: 'vinted', status: 'listed', days: 8 }, { m: 'poshmark', status: 'needs_action', days: 0 }] },
  { id: 'a7', title: 'Baggy banana hoodie', brand: '', art: 'banana-hoodie', print: 'banana-fit', category: 'knitwear', subcategory: 'hoodies', size: 'L', price: 34, status: 'listed', created: 15, listings: [{ m: 'poshmark', status: 'listed', days: 14 }] },
  { id: 'a8', title: 'Chunky brown knit', brand: '', art: null, print: 'knit', category: 'knitwear', subcategory: 'sweaters', size: 'M', price: 30, status: 'shipped', created: 90, cost: 6, listings: [{ m: 'ebay', status: 'sold', days: 70 }], sold: { days: 40, price: 28, m: 'ebay' } },
  { id: 'a9', title: 'Boxy coffee long sleeve', brand: '', art: 'coffee-longsleeve', print: 'grey-fit', category: 'tops', subcategory: 't-shirts', size: 'L', price: 18, status: 'draft', created: 2 },
  { id: 'a10', title: 'Colour block anorak', brand: '', art: 'anorak', print: 'cargo-fit', category: 'outerwear', subcategory: 'jackets', size: 'M', price: 48, status: 'listed', created: 70, cost: 12, listings: [{ m: 'ebay', status: 'listed', days: 66 }, { m: 'grailed', status: 'listed', days: 66 }] },
  { id: 'a11', title: 'Smiley graphic hoodie', brand: '', art: null, print: 'pine-fit', category: 'knitwear', subcategory: 'hoodies', size: 'XL', price: 28, status: 'sold', created: 130, cost: 4, listings: [{ m: 'depop', status: 'sold', days: 120 }], sold: { days: 100, price: 25, m: 'depop' } },
  { id: 'a12', title: 'Navy sherpa collar jacket', brand: '', art: 'navy-bomber', print: 'cargo-fit', category: 'outerwear', subcategory: 'jackets', size: 'M', price: 42, status: 'shipped', created: 200, cost: 10, listings: [{ m: 'vinted', status: 'sold', days: 190 }], sold: { days: 160, price: 40, m: 'vinted' } },
  { id: 'a13', title: 'Mexico 66 trainers in yellow', brand: 'Onitsuka Tiger', art: 'mexico66-yellow', print: 'selvedge-fit', category: 'shoes', subcategory: 'sneakers', size: 'UK 8', price: 65, status: 'listed', created: 26, cost: 20, listings: [{ m: 'ebay', status: 'listed', days: 24 }, { m: 'grailed', status: 'listed', days: 24 }] },
  { id: 'a14', title: 'Yellow dad cap', brand: '', art: 'cap', print: 'grey-fit', category: 'accessories', subcategory: 'hats', size: '', price: 9, status: 'ready', created: 4 },
  { id: 'a15', title: 'Washed indigo selvedge jeans', brand: '', art: 'shroud-selvedge', print: 'selvedge-fit', category: 'bottoms', subcategory: 'jeans', size: 'W32 L30', price: 40, status: 'listed', created: 11, listings: [{ m: 'depop', status: 'listed', days: 10 }, { m: 'vinted', status: 'listed', days: 10 }] },
  { id: 'a16', title: 'Pine heavyweight hoodie', brand: '', art: 'pine-hoodie', print: 'pine-fit', category: 'knitwear', subcategory: 'hoodies', size: 'M', price: 32, status: 'draft', created: 1 },
  { id: 'a17', title: 'Cream baggy cargos', brand: '', art: 'cream-cargos', print: 'cargo-fit', category: 'bottoms', subcategory: 'trousers', size: 'W32', price: 28, status: 'ready', created: 5 },
  { id: 'a18', title: 'Carolina blue mesh shorts', brand: '', art: 'mesh-shorts', print: 'grey-fit', category: 'bottoms', subcategory: 'shorts', size: 'M', price: 15, status: 'listed', created: 7, listings: [{ m: 'depop', status: 'listed', days: 6 }] },
];

const ASSETS = fileURLToPath(new URL('../src/assets/', import.meta.url));
const file = (dir: string, name: string) => readFileSync(`${ASSETS}${dir}/${name}.webp`);
// The garment on a plain backdrop: what a seller's own photo of it looks like.
const STUDIO = fileURLToPath(new URL('./photos/', import.meta.url));

function buildItems() {
  return SEEDS.map(s => {
    const listings = (s.listings ?? []).map((l, i) => ({
      id: `${s.id}-l${i}`,
      user_id: UID,
      item_id: s.id,
      marketplace: l.m,
      status: l.status,
      external_id: l.status === 'listed' || l.status === 'sold' ? `${l.m}-${s.id}` : null,
      external_url: l.status === 'listed' ? `https://example.com/${l.m}/${s.id}` : null,
      title: null,
      price: String(l.price ?? s.price ?? 0),
      payload: {},
      error: l.status === 'needs_action' ? 'Poshmark wants a category the form could not find. Pick it in the tab, then press List.' : null,
      listed_at: l.status === 'queued' ? null : daysAgo(l.days),
      last_synced_at: null,
      relist_count: 0,
      created_at: daysAgo(l.days),
      updated_at: daysAgo(l.days),
    }));
    return {
      id: s.id,
      user_id: UID,
      sku: `${s.category.slice(0, 3).toUpperCase()}-${s.id.toUpperCase().padStart(5, 'Q')}`,
      status: s.status,
      title: s.title,
      brand: s.brand,
      department: 'unisex',
      category: s.category,
      subcategory: s.subcategory,
      size: s.size || null,
      size_system: null,
      colors: ['Blue'],
      materials: ['Cotton'],
      condition: 'good',
      flaws: null,
      measurements: null,
      style_tags: ['casual', 'everyday'],
      era: null,
      description: `${s.title}. Good condition, light wear, no holes or stains.`,
      price: s.price == null ? null : String(s.price),
      original_price: null,
      cost: s.cost == null ? null : String(s.cost),
      currency: 'USD',
      location: 'Bin 2',
      notes: null,
      ai: null,
      price_suggestion:
        s.id === 'a1'
          ? { suggested: 48, low: 38, high: 60, currency: 'USD', confidence: 'medium', reasons: ['11 sold listings on eBay, median $47', 'Good condition, priced at the middle'], comps_used: 11, computed_at: daysAgo(2) }
          : null,
      sold_at: s.sold ? daysAgo(s.sold.days) : null,
      sold_price: s.sold ? String(s.sold.price) : null,
      sold_marketplace: s.sold?.m ?? null,
      created_at: daysAgo(s.created),
      updated_at: daysAgo(s.created),
      photos: [
        { id: `${s.id}-p0`, user_id: UID, item_id: s.id, path: `${UID}/${s.id}/p0.jpg`, cutout_path: s.art ? `${UID}/${s.id}/p0-cut.webp` : null, position: 0, width: 800, height: 1000 },
        { id: `${s.id}-p1`, user_id: UID, item_id: s.id, path: `${UID}/${s.id}/p1.jpg`, cutout_path: null, position: 1, width: 800, height: 1000 },
      ],
      listings,
    };
  });
}

const PROFILE = {
  id: UID,
  display_name: 'Sam',
  currency: 'USD',
  region: 'US',
  measurement_unit: 'in',
  voice: { tone: 'friendly', sign_off: null, always_mention: [], avoid_words: [] },
  fee_overrides: {},
  marketplaces: ['ebay', 'vinted', 'depop', 'poshmark'],
  price_strategy: 'same',
  stale_after_days: 30,
  created_at: daysAgo(200),
  updated_at: daysAgo(1),
};

const JOBS = [
  {
    id: 'j1', user_id: UID, kind: 'publish', runner: 'extension', marketplace: 'poshmark', item_id: 'a6', listing_id: 'a6-l1',
    status: 'needs_user', payload: {}, result: null, error: 'Open the Poshmark tab and choose a category, then press List.', attempts: 1,
    run_after: daysAgo(0), created_at: daysAgo(0), updated_at: daysAgo(0),
  },
  {
    id: 'j2', user_id: UID, kind: 'publish', runner: 'server', marketplace: 'ebay', item_id: 'a2', listing_id: 'a2-l1',
    status: 'pending', payload: {}, result: null, error: null, attempts: 0, run_after: daysAgo(0), created_at: daysAgo(0), updated_at: daysAgo(0),
  },
];

function session() {
  const exp = Math.floor(now / 1000) + 3600 * 24;
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp, email: 'sam@example.com' })}.sig`;
  return {
    access_token: token,
    refresh_token: 'refresh',
    token_type: 'bearer',
    expires_in: 3600 * 24,
    expires_at: exp,
    user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'sam@example.com', app_metadata: {}, user_metadata: {}, created_at: daysAgo(200) },
  };
}

export interface MockOptions {
  signedIn?: boolean;
  empty?: boolean;
  marketplaces?: string[];
  legacyMarketplace?: string;
}

export async function mockSupabase(page: Page, opts: MockOptions = {}) {
  const items = opts.empty ? [] : buildItems();
  if (opts.legacyMarketplace && items[0]?.listings[0]) {
    items[0].listings.push({ ...items[0].listings[0], id: 'legacy-listing', marketplace: opts.legacyMarketplace });
  }
  const seeds = new Map(SEEDS.map(s => [s.id, s]));
  if (opts.signedIn !== false) {
    await page.addInitScript(
      ([key, value]) => {
        window.localStorage.setItem(key!, value!);
      },
      ['sb-supabase-auth-token', JSON.stringify(session())],
    );
  }

  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });

  await page.route(`${SUPABASE}/**`, async route => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    if (req.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    }
    if (path.startsWith('/rest/v1/profiles')) {
      const profile = { ...PROFILE, marketplaces: opts.marketplaces ?? PROFILE.marketplaces };
      return json(route, single ? profile : [profile]);
    }
    if (path.startsWith('/rest/v1/items')) {
      const id = url.searchParams.get('id')?.replace('eq.', '');
      if (id) {
        const it = items.find(i => i.id === id) ?? null;
        return json(route, single ? it : it ? [it] : []);
      }
      return json(route, items);
    }
    if (path.startsWith('/rest/v1/jobs')) return json(route, opts.empty ? [] : JOBS);
    if (path.startsWith('/rest/v1/events')) {
      return json(route, [
        { id: 'e1', user_id: UID, item_id: 'a1', listing_id: 'a1-l0', marketplace: 'ebay', type: 'listed', data: {}, at: daysAgo(41) },
        { id: 'e0', user_id: UID, item_id: 'a1', listing_id: null, marketplace: null, type: 'created', data: {}, at: daysAgo(48) },
      ]);
    }
    if (path.startsWith('/rest/v1/marketplace_accounts')) return json(route, []);
    if (path.startsWith('/functions/v1/ebay-connect')) {
      return json(route, {
        configured: true,
        connected: true,
        account: { id: 'acc', marketplace: 'ebay', status: 'connected', username: 'sam_resells', meta: { postal_code: '11211' }, last_sync_at: daysAgo(0.01), last_error: null },
        fulfillment: [{ id: 'f1', name: 'USPS Ground Advantage' }],
        payment: [{ id: 'p1', name: 'Managed payments' }],
        returns: [{ id: 'r1', name: '30 day returns' }],
      });
    }
    if (path.startsWith('/functions/v1/price-comps')) {
      const sold = [32, 35, 38, 40, 42, 44, 45, 48, 52, 58];
      return json(route, {
        suggestion: {
          suggested: 44, low: 38, high: 52, quick: 34, max: 56, currency: 'USD', confidence: 'high',
          tiers: { likely: 38, balanced: 44, less_likely: 52 }, days_to_sell: 9,
          reasons: ['10 similar pieces sold (6 on eBay, 4 on Poshmark). The middle is 44 USD.'], comps_used: 10, computed_at: daysAgo(0),
          sold_prices: sold, asking_prices: [], sources: { sold: 10, asking: 0, own: 0, ai: false, dropped: 2, sold_by: { ebay: 6, poshmark: 4 } },
        },
        comps: sold.map((price, i) => ({ source: 'ebay', title: `Raw selvedge jeans W30 #${i}`, price, currency: 'USD', url: `https://www.ebay.com/itm/${i}`, sold: true })),
        sources: { ebay_configured: false, asking: 0, sold: 10, own_sales: 0, notes: ['eBay is not connected on this server yet, so live eBay listings are not included.'] },
        error: null,
      });
    }
    if (path.startsWith('/functions/v1/')) return json(route, {});
    if (path.startsWith('/storage/v1/object/sign/photos') && req.method() === 'POST') {
      const body = req.postDataJSON() as { paths?: string[] };
      return json(route, (body.paths ?? []).map(p => ({ path: p, signedURL: `/object/sign/photos/${p}?token=t`, error: null })));
    }
    if (path.startsWith('/storage/v1/object/sign/photos/')) {
      const parts = path.split('/');
      const name = parts.at(-1)!;
      const seed = seeds.get(parts.at(-2)!);
      if (!seed) return route.fulfill({ status: 404 });
      const body = !seed.art
        ? file('photos', seed.print)
        : name.includes('-cut')
          ? file('closet', seed.art)
          : readFileSync(`${STUDIO}${seed.art}.webp`);
      return route.fulfill({ status: 200, contentType: 'image/webp', body, headers: { 'access-control-allow-origin': '*' } });
    }
    if (path.startsWith('/auth/v1/user')) return json(route, session().user);
    return json(route, {});
  });
}

