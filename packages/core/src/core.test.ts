import { describe, expect, it } from 'vitest';
import {
  buildHashtags,
  buildTitle,
  clampParagraphs,
  clampWords,
  computeAnalytics,
  feeFor,
  feeRule,
  generateListing,
  makeSku,
  matchCategory,
  normalizeScan,
  priceForTakeHome,
  priceOn,
  suggestPrice,
  takeHome,
  toHashtag,
  type Item,
  type Listing,
} from './index.ts';

const baseItem = (patch: Partial<Item> = {}): Item => ({
  id: 'i1',
  user_id: 'u1',
  sku: 'OUT-ABCDE',
  status: 'ready',
  title: 'Faded denim trucker jacket',
  brand: "Levi's",
  department: 'men',
  category: 'outerwear',
  subcategory: 'denim-jackets',
  size: 'M',
  size_system: 'letter',
  colors: ['blue'],
  materials: ['100% cotton'],
  condition: 'good',
  flaws: 'Small mark on left cuff',
  measurements: { unit: 'in', pit_to_pit: 22, length: 26.5 },
  style_tags: ['vintage', 'workwear'],
  era: '90s',
  description: 'Broken-in 90s trucker with a perfect fade.',
  price: 60,
  original_price: null,
  cost: 12,
  currency: 'USD',
  location: 'Bin A',
  notes: null,
  ai: null,
  price_suggestion: null,
  sold_at: null,
  sold_price: null,
  sold_marketplace: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  photos: [{ id: 'p', item_id: 'i1', path: 'u1/i1/p.jpg', cutout_path: null, position: 0, width: 1, height: 1 }],
  ...patch,
});

describe('text helpers', () => {
  it('clamps on a word boundary', () => {
    expect(clampWords('one two three four five', 13)).toBe('one two three');
    expect(clampWords('short', 80)).toBe('short');
  });
  it('clamps paragraphs on a line end', () => {
    const text = 'Line one is here.\nLine two is longer than the rest.\nThird.';
    expect(clampParagraphs(text, 40)).toBe('Line one is here.');
  });
  it('makes hashtags', () => {
    expect(toHashtag('Y2K baby tee')).toBe('#y2kbabytee');
    expect(toHashtag('é')).toBeNull();
  });
});

describe('fees and prices', () => {
  it('uses Poshmark’s flat fee under $15', () => {
    const rule = feeRule('poshmark', 'US');
    expect(feeFor(10, rule)).toBe(2.95);
    expect(feeFor(100, rule)).toBe(20);
    expect(takeHome(100, rule)).toBe(80);
  });
  it('inverts take-home', () => {
    const rule = feeRule('ebay', 'US');
    const price = priceForTakeHome(50, rule);
    expect(takeHome(price, rule)).toBeCloseTo(50, 1);
  });
  it('respects seller fee overrides', () => {
    expect(feeRule('depop', 'US', { depop: { percent: 10, fixed: 0 } })).toEqual({ percent: 10, fixed: 0 });
  });
  it('raises prices on high-fee marketplaces when matching take-home', () => {
    expect(priceOn(50, 'vinted', 'US', 'match_take_home')).toBe(50);
    expect(priceOn(50, 'poshmark', 'US', 'match_take_home')).toBeGreaterThan(60);
    expect(priceOn(50, 'poshmark', 'US', 'same')).toBe(50);
  });
});

describe('suggestPrice', () => {
  it('returns null with no evidence', () => {
    expect(suggestPrice({ currency: 'USD', condition: 'good' })).toBeNull();
  });
  it('blends comps and the AI estimate', () => {
    const s = suggestPrice({
      currency: 'USD',
      condition: 'good',
      ai: { low: 40, high: 70, suggested: 55 },
      comps: [
        { source: 'ebay', title: 'a', price: 50, currency: 'USD', sold: true },
        { source: 'ebay', title: 'b', price: 60, currency: 'USD', sold: true },
        { source: 'ebay', title: 'c', price: 80, currency: 'USD', sold: false },
        { source: 'ebay', title: 'd', price: 999, currency: 'EUR', sold: true },
      ],
    })!;
    expect(s.suggested).toBeGreaterThan(45);
    expect(s.suggested).toBeLessThan(65);
    expect(s.low).toBeLessThanOrEqual(s.suggested);
    expect(s.high).toBeGreaterThanOrEqual(s.suggested);
    expect(s.comps_used).toBe(3);
    expect(s.reasons.length).toBe(3);
  });
  it('drops the price for stale listings', () => {
    const fresh = suggestPrice({ currency: 'USD', condition: 'good', ai: { low: 80, high: 120, suggested: 100 } })!;
    const stale = suggestPrice({ currency: 'USD', condition: 'good', ai: { low: 80, high: 120, suggested: 100 }, days_listed: 75 })!;
    expect(stale.suggested).toBeLessThan(fresh.suggested);
  });
});

describe('listing generator', () => {
  it('builds an eBay title within 80 characters', () => {
    const title = buildTitle(baseItem(), 80);
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title).toContain("Levi's");
    expect(title).toContain('Size M');
  });
  it('writes Depop listings with hashtags and no title', () => {
    const listing = generateListing(baseItem(), 'depop');
    expect(listing.title).toBe('');
    expect(listing.hashtags.length).toBeLessThanOrEqual(5);
    expect(listing.description).toContain('#vintage');
    expect(listing.description.length).toBeLessThanOrEqual(1000);
  });
  it('includes measurements and flaws', () => {
    const listing = generateListing(baseItem(), 'poshmark');
    expect(listing.description).toContain('Pit to pit: 22 in');
    expect(listing.description).toContain('Small mark on left cuff');
  });
  it('warns when required fields are missing', () => {
    const listing = generateListing(baseItem({ price: null, photos: [] }), 'ebay');
    expect(listing.warnings.join(' ')).toMatch(/price/);
    expect(listing.warnings.join(' ')).toMatch(/photo/);
  });
  it('removes words the seller avoids', () => {
    const listing = generateListing(baseItem({ description: 'A rare perfect fade.' }), 'vinted', {
      voice: { tone: 'minimal', sign_off: 'Thanks!', always_mention: ['Ships in 2 days'], avoid_words: ['rare'] },
    });
    expect(listing.description).not.toMatch(/rare/i);
    expect(listing.description).toContain('Ships in 2 days');
    expect(listing.description).toContain('Thanks!');
  });
  it('limits hashtags', () => {
    expect(buildHashtags(baseItem(), 2)).toHaveLength(2);
    expect(buildHashtags(baseItem(), 0)).toHaveLength(0);
  });
});

describe('scan normaliser', () => {
  it('repairs drifted model output', () => {
    const scan = normalizeScan(
      {
        title: 'Black leather jacket',
        brand: 'Unknown',
        department: 'Women',
        category: 'Jackets',
        condition: 'Like new',
        colors: ['Black'],
        price: { low: '90', high: 40 },
        confidence: 85,
      },
      'GBP',
    );
    expect(scan.brand).toBeNull();
    expect(scan.department).toBe('women');
    expect(scan.category).toBe('outerwear');
    expect(scan.condition).toBeNull();
    expect(scan.price.low).toBe(40);
    expect(scan.price.high).toBe(90);
    expect(scan.price.suggested).toBe(65);
    expect(scan.confidence).toBeCloseTo(0.85);
    expect(scan.colors).toEqual(['black']);
  });
  it('matches free-text categories', () => {
    expect(matchCategory('vintage denim jacket')).toEqual({ category: 'outerwear', subcategory: 'denim-jackets' });
    expect(matchCategory('nike trainers')).toEqual({ category: 'shoes', subcategory: 'sneakers' });
  });
});

describe('analytics', () => {
  it('computes revenue, profit and sell-through', () => {
    const now = new Date('2026-10-20T00:00:00Z');
    const items: Item[] = [
      baseItem({ id: 'a', status: 'sold', sold_at: '2026-10-10T00:00:00Z', sold_price: 100, sold_marketplace: 'poshmark', cost: 10 }),
      baseItem({ id: 'b', status: 'listed', created_at: '2026-07-01T00:00:00Z' }),
      baseItem({ id: 'c', status: 'ready' }),
    ];
    const listings: Listing[] = [
      {
        id: 'l1', user_id: 'u1', item_id: 'a', marketplace: 'poshmark', status: 'sold', external_id: null, external_url: null,
        title: null, price: 100, payload: {}, error: null, listed_at: '2026-10-01T00:00:00Z', last_synced_at: null,
        relist_count: 0, created_at: '', updated_at: '',
      },
    ];
    const a = computeAnalytics(items, listings, { region: 'US', now, stale_after_days: 30 });
    expect(a.sold).toBe(1);
    expect(a.revenue).toBe(100);
    expect(a.fees).toBe(20);
    expect(a.profit).toBe(70);
    expect(a.sell_through).toBe(0.5);
    expect(a.median_days_to_sell).toBe(9);
    expect(a.stale.map(s => s.item_id)).toEqual(['b']);
    expect(a.aging.find(b => b.label === 'Over 90 days')!.count).toBe(1);
    expect(a.months.at(-1)!.revenue).toBe(100);
  });
});

describe('sku', () => {
  it('makes readable SKUs', () => {
    let n = 0;
    const sku = makeSku('outerwear', () => (n++ % 10) / 10);
    expect(sku).toMatch(/^OUT-[2-9A-Z]{5}$/);
    expect(sku).not.toMatch(/[01OIL]/.source.replace('O', '0'));
  });
});
