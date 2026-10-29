// A fake Supabase for end-to-end tests and screenshots: a signed-in seller
// with a small closet, served by intercepting the app's network calls.

import type { Page, Route } from '@playwright/test';

export const SUPABASE = 'http://supabase.test';
export const UID = '00000000-0000-4000-8000-000000000001';

const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

type Kind = 'tee' | 'jeans' | 'jacket' | 'dress' | 'sneaker' | 'tote';

interface Seed {
  id: string;
  title: string;
  brand: string;
  kind: Kind;
  color: string;
  category: string;
  subcategory: string;
  size: string;
  price: number | null;
  status: 'draft' | 'ready' | 'listed' | 'sold' | 'shipped';
  created: number;
  cutout: boolean;
  listings?: Array<{ m: string; status: string; days: number; price?: number }>;
  sold?: { days: number; price: number; m: string | null };
  cost?: number;
}

const SEEDS: Seed[] = [
  { id: 'a1', title: "Levi's 501 straight leg jeans", brand: "Levi's", kind: 'jeans', color: '#3d5a8a', category: 'bottoms', subcategory: 'jeans', size: 'W32 L30', price: 45, status: 'listed', created: 48, cutout: true, cost: 8, listings: [{ m: 'ebay', status: 'listed', days: 41 }, { m: 'vinted', status: 'listed', days: 41 }] },
  { id: 'a2', title: 'Carhartt Detroit jacket, brown duck canvas', brand: 'Carhartt', kind: 'jacket', color: '#8a5a2b', category: 'outerwear', subcategory: 'jackets', size: 'L', price: 120, status: 'listed', created: 20, cutout: true, cost: 30, listings: [{ m: 'depop', status: 'listed', days: 12 }, { m: 'ebay', status: 'queued', days: 0 }] },
  { id: 'a3', title: 'Patagonia Synchilla fleece', brand: 'Patagonia', kind: 'jacket', color: '#2f7d6d', category: 'knitwear', subcategory: 'sweatshirts', size: 'M', price: null, status: 'draft', created: 1, cutout: false },
  { id: 'a4', title: 'Ralph Lauren oxford shirt', brand: 'Ralph Lauren', kind: 'tee', color: '#9cc3e6', category: 'tops', subcategory: 'shirts', size: 'M', price: 28, status: 'ready', created: 3, cutout: true },
  { id: 'a5', title: 'Dr. Martens 1460 boots', brand: 'Dr. Martens', kind: 'sneaker', color: '#2a1c18', category: 'shoes', subcategory: 'boots', size: 'UK 7', price: 75, status: 'sold', created: 60, cutout: true, cost: 15, listings: [{ m: 'vinted', status: 'sold', days: 30 }, { m: 'depop', status: 'delisted', days: 30 }], sold: { days: 2, price: 70, m: 'vinted' } },
  { id: 'a6', title: 'Nike Air Max 90 tee', brand: 'Nike', kind: 'tee', color: '#f2f2ec', category: 'tops', subcategory: 't-shirts', size: 'S', price: 18, status: 'listed', created: 9, cutout: true, listings: [{ m: 'vinted', status: 'listed', days: 8 }, { m: 'poshmark', status: 'needs_action', days: 0 }] },
  { id: 'a7', title: 'Zara satin slip dress', brand: 'Zara', kind: 'dress', color: '#c2185b', category: 'dresses', subcategory: 'midi-dresses', size: 'S', price: 22, status: 'listed', created: 15, cutout: true, listings: [{ m: 'poshmark', status: 'listed', days: 14 }] },
  { id: 'a8', title: 'Coach leather tote', brand: 'Coach', kind: 'tote', color: '#6d4c41', category: 'bags', subcategory: 'totes', size: '', price: 95, status: 'shipped', created: 90, cutout: false, cost: 20, listings: [{ m: 'ebay', status: 'sold', days: 70 }], sold: { days: 40, price: 92, m: 'ebay' } },
  { id: 'a9', title: 'Uniqlo merino crewneck', brand: 'Uniqlo', kind: 'tee', color: '#f2b234', category: 'knitwear', subcategory: 'sweaters', size: 'L', price: 20, status: 'draft', created: 2, cutout: true },
  { id: 'a10', title: "Arc'teryx Beta shell jacket", brand: "Arc'teryx", kind: 'jacket', color: '#1e88e5', category: 'outerwear', subcategory: 'jackets', size: 'M', price: 210, status: 'listed', created: 70, cutout: true, cost: 60, listings: [{ m: 'ebay', status: 'listed', days: 66 }, { m: 'grailed', status: 'listed', days: 66 }] },
  { id: 'a11', title: 'Stussy 8 ball hoodie', brand: 'Stussy', kind: 'tee', color: '#212121', category: 'knitwear', subcategory: 'hoodies', size: 'XL', price: 65, status: 'sold', created: 130, cutout: true, cost: 10, listings: [{ m: 'depop', status: 'sold', days: 120 }], sold: { days: 100, price: 60, m: 'depop' } },
  { id: 'a12', title: 'Levi\'s trucker jacket', brand: "Levi's", kind: 'jacket', color: '#5b7fb0', category: 'outerwear', subcategory: 'denim-jackets', size: 'M', price: 55, status: 'shipped', created: 200, cutout: true, cost: 12, listings: [{ m: 'vinted', status: 'sold', days: 190 }], sold: { days: 160, price: 50, m: 'vinted' } },
];

const GARMENT: Record<Kind, { view: string; body: string }> = {
  tee: { view: '0 0 140 130', body: 'M48 6 C56 16 84 16 92 6 L132 26 L118 56 L104 50 L104 124 L36 124 L36 50 L22 56 L8 26 Z' },
  jeans: { view: '0 0 110 150', body: 'M14 4 L96 4 L104 146 L64 146 L56 50 L54 50 L46 146 L6 146 Z' },
  jacket: { view: '0 0 150 150', body: 'M52 6 L98 6 L140 28 L146 140 L120 140 L116 70 L114 144 L36 144 L34 70 L30 140 L4 140 L10 28 Z' },
  dress: { view: '0 0 120 150', body: 'M38 4 L48 4 C50 18 70 18 72 4 L82 4 L84 40 C84 48 80 52 80 56 L112 146 L8 146 L40 56 C40 52 36 48 36 40 Z' },
  sneaker: { view: '0 0 160 90', body: 'M8 52 C8 30 22 14 40 12 L60 14 C70 30 92 40 118 44 C140 48 152 56 152 68 L152 80 L8 80 Z' },
  tote: { view: '0 0 120 140', body: 'M10 46 L110 46 L104 136 L16 136 Z M36 46 C36 4 84 4 84 46 L76 46 C76 16 44 16 44 46 Z' },
};

function garmentSvg(seed: Seed, cutout: boolean): string {
  const g = GARMENT[seed.kind];
  const [, , w, h] = g.view.split(' ').map(Number);
  const shade = `<path d="${g.body}" fill="url(#s)" fill-rule="evenodd"/>`;
  const defs = `<defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient></defs>`;
  if (cutout) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${g.view}" width="${w! * 4}" height="${h! * 4}">${defs}<path d="${g.body}" fill="${seed.color}" fill-rule="evenodd"/>${shade}</svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-30 -30 ${w! + 60} ${(w! + 60) * 1.25}" width="800" height="1000">${defs}<rect x="-30" y="-30" width="${w! + 60}" height="${(w! + 60) * 1.25}" fill="#d9d4cb"/><rect x="-30" y="${h! + 10}" width="${w! + 60}" height="200" fill="#c9c1b4"/><path d="${g.body}" fill="${seed.color}" fill-rule="evenodd"/>${shade}</svg>`;
}

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
      style_tags: ['vintage', 'workwear'],
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
        { id: `${s.id}-p0`, user_id: UID, item_id: s.id, path: `${UID}/${s.id}/p0.jpg`, cutout_path: s.cutout ? `${UID}/${s.id}/p0-cut.webp` : null, position: 0, width: 800, height: 1000 },
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
}

export async function mockSupabase(page: Page, opts: MockOptions = {}) {
  const items = opts.empty ? [] : buildItems();
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
    if (path.startsWith('/rest/v1/profiles')) return json(route, single ? PROFILE : [PROFILE]);
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
    if (path.startsWith('/functions/v1/')) return json(route, {});
    if (path.startsWith('/storage/v1/object/sign/photos') && req.method() === 'POST') {
      const body = req.postDataJSON() as { paths?: string[] };
      return json(route, (body.paths ?? []).map(p => ({ path: p, signedURL: `/object/sign/photos/${p}?token=t`, error: null })));
    }
    if (path.startsWith('/storage/v1/object/sign/photos/')) {
      const parts = path.split('/');
      const file = parts.at(-1)!;
      const seed = seeds.get(parts.at(-2)!);
      if (!seed) return route.fulfill({ status: 404 });
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: garmentSvg(seed, file.includes('-cut')), headers: { 'access-control-allow-origin': '*' } });
    }
    if (path.startsWith('/auth/v1/user')) return json(route, session().user);
    return json(route, {});
  });
}
