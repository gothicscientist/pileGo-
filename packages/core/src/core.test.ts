import { describe, expect, it } from 'vitest';
import {
  buildHashtags,
  buildTitle,
  clampParagraphs,
  clampWords,
  cleanComps,
  compQuery,
  computeAnalytics,
  looksLikeLot,
  conditionFromText,
  parsePoshmarkSearch,
  priceAdvice,
  priceTiers,
  sanitizeClientComps,
  weightedQuantile,
  sanitizeSoldComps,
  sizesInTitle,
  trimOutliers,
  feeFor,
  feeRule,
  generateListing,
  clearEstimates,
  isEstimated,
  makeSku,
  matchCategory,
  measurementLines,
  measurementsFromEstimate,
  normalizeEstimate,
  normalizeScan,
  photoCaption,
  scanUserPrompt,
  setMeasurement,
  priceForTakeHome,
  priceOn,
  suggestPrice,
  takeHome,
  toHashtag,
  type Item,
  type Listing,
  type PriceComp,
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
    // Sold, asking, AI, and the euro comparable that was left out.
    expect(s.reasons.length).toBe(4);
    expect(s.sources).toEqual({ sold: 2, asking: 1, own: 0, ai: true, dropped: 1, sold_by: { ebay: 2 } });
  });
  it('discounts an AI-only estimate', () => {
    const s = suggestPrice({ currency: 'USD', condition: 'good', ai: { low: 40, high: 60, suggested: 50 } })!;
    expect(s.suggested).toBe(40);
    expect(s.low).toBe(32);
    expect(s.high).toBe(48);
    expect(s.confidence).toBe('low');
    expect(s.quick!).toBeLessThan(s.low);
  });
  it('lets sold prices outweigh a high AI guess', () => {
    const sold = [22, 24, 25, 26, 28, 30].map((price, i) => ({ source: 'ebay' as const, title: `hoodie ${i}`, price, currency: 'USD', sold: true }));
    const s = suggestPrice({ currency: 'USD', condition: 'good', ai: { low: 40, high: 70, suggested: 55 }, comps: sold })!;
    expect(s.suggested).toBeGreaterThan(24);
    expect(s.suggested).toBeLessThan(31);
    expect(s.confidence).toBe('high');
    expect(s.sold_prices).toEqual([22, 24, 25, 26, 28, 30]);
  });
});

describe('comparables', () => {
  it('builds a search without the size and with the distinctive words', () => {
    const q = compQuery(baseItem({ title: "Levi's faded denim trucker jacket size M", size: 'M', subcategory: 'denim-jackets', category: 'outerwear' }));
    expect(q).toContain("Levi's");
    expect(q).toContain('trucker');
    expect(q).not.toMatch(/\bM\b/);
    expect(q).not.toMatch(/size/i);
    expect(compQuery(baseItem({ category: 'outerwear', subcategory: 'denim-jackets' }), { broad: true })).toBe("Levi's Denim jackets");
  });
  it('trims outliers', () => {
    expect(trimOutliers([20, 22, 24, 25, 26, 28, 300])).toEqual([20, 22, 24, 25, 26, 28]);
    expect(trimOutliers([2, 40, 42, 44, 45])).toEqual([40, 42, 44, 45]);
    expect(trimOutliers([10, 500])).toEqual([10, 500]);
  });
  it('spots bundles and sizes in titles', () => {
    expect(looksLikeLot('Lot of 5 vintage tees')).toBe(true);
    expect(looksLikeLot('Bundle 3 hoodies')).toBe(true);
    expect(looksLikeLot('Patagonia Better Sweater fleece')).toBe(false);
    expect(sizesInTitle('Patagonia Better Sweater Mens Size L')).toEqual(['l']);
    expect(sizesInTitle('Nike tee XL black')).toEqual(['xl']);
    expect(sizesInTitle('Small batch denim from Japan')).toEqual([]);
  });
  it('checks sold prices sent from the browser', () => {
    const out = sanitizeSoldComps([
      { title: 'Fleece', price: 40, currency: 'usd', url: 'https://www.ebay.com/itm/1', sold: false },
      { title: 'Fleece', price: '41.5', currency: 'USD', url: 'https://evil.example/itm/1' },
      { title: '', price: 40, currency: 'USD' },
      { title: 'Fleece', price: -1, currency: 'USD' },
      { title: 'Fleece', price: 20000, currency: 'USD' },
      { title: 'Fleece', price: 40, currency: 'DOLLARS' },
      null,
    ]);
    expect(out).toEqual([
      { source: 'ebay', title: 'Fleece', price: 40, currency: 'USD', url: 'https://www.ebay.com/itm/1', sold: true },
      { source: 'ebay', title: 'Fleece', price: 41.5, currency: 'USD', url: null, sold: true },
    ]);
    expect(sanitizeSoldComps('nope')).toEqual([]);
    expect(sanitizeSoldComps(Array.from({ length: 250 }, () => ({ title: 'x', price: 1, currency: 'USD' }))).length).toBe(200);
  });
  it('keeps comparables in the same size, currency and one piece', () => {
    const c = (title: string, price: number, currency = 'USD') => ({ source: 'ebay' as const, title, price, currency, sold: true });
    const out = cleanComps(
      [c('Fleece Size M', 40), c('Fleece M navy', 42), c('Fleece size L', 60), c('Fleece', 44), c('Lot of 3 fleeces', 90), c('Fleece M', 41, 'GBP')],
      { currency: 'USD', size: 'Medium' },
    );
    expect(out.sold).toEqual([40, 42, 44]);
    expect(out.dropped).toBe(3);
  });
});

describe('price picker', () => {
  const sold = [18, 20, 22, 24, 25, 26, 28, 30, 34, 38].map((price, i) => ({ source: 'ebay' as const, title: `t${i}`, price, currency: 'USD', sold: true }));
  const s = suggestPrice({ currency: 'USD', condition: 'good', comps: sold })!;
  const rule = feeRule('depop', 'US');

  it('offers three prices in order, from what sold', () => {
    const t = priceTiers(s);
    expect(t.likely).toBeLessThan(t.balanced);
    expect(t.balanced).toBeLessThan(t.less_likely);
    expect(t.balanced).toBe(s.suggested);
    expect(t.likely).toBeGreaterThanOrEqual(18);
    expect(t.less_likely).toBeLessThanOrEqual(38);
  });
  it('says when a typed price is high, with the price to come down to', () => {
    const t = priceTiers(s);
    const high = priceAdvice(s, t.less_likely + 10, [{ id: 'depop', rule }]);
    expect(high.tone).toBe('high');
    expect(high.target).toBe(t.less_likely);
    expect(high.text).toContain(`${t.less_likely}`);
    expect(high.take_home[0]!.keep).toBeLessThan(t.less_likely + 10);
    expect(priceAdvice(s, t.balanced).tone).toBe('fair');
    expect(priceAdvice(s, t.likely).tone).toBe('fast');
    expect(priceAdvice(s, 5).tone).toBe('low');
    expect(priceAdvice(s, t.less_likely).tone).toBe('slow');
  });
  it('derives the cards for suggestions saved before the picker', () => {
    const old = { suggested: 48, low: 38, high: 60, quick: 34, currency: 'USD', confidence: 'medium' as const, reasons: [], comps_used: 11, computed_at: '' };
    expect(priceTiers(old)).toEqual({ likely: 34, balanced: 48, less_likely: 60 });
  });
  it('drops the price for stale listings', () => {
    const fresh = suggestPrice({ currency: 'USD', condition: 'good', ai: { low: 80, high: 120, suggested: 100 } })!;
    const stale = suggestPrice({ currency: 'USD', condition: 'good', ai: { low: 80, high: 120, suggested: 100 }, days_listed: 75 })!;
    expect(stale.suggested).toBeLessThan(fresh.suggested);
  });
});

describe('weighing comparables', () => {
  const now = new Date('2026-10-29T00:00:00Z');
  const comp = (title: string, price: number, extra: Partial<PriceComp> = {}): PriceComp => ({ source: 'poshmark', title, price, currency: 'USD', sold: true, ...extra });

  it('takes a weighted quantile', () => {
    const pts = [10, 20, 30].map(price => ({ price, weight: 1 }));
    expect(weightedQuantile(pts, 0.5)).toBe(20);
    expect(weightedQuantile([{ price: 10, weight: 1 }, { price: 30, weight: 3 }], 0.5)).toBeGreaterThan(20);
    expect(weightedQuantile([], 0.5)).toBeNull();
  });
  it('leans toward comparables with the same words', () => {
    const comps = [
      ...[60, 62, 64].map((p, i) => comp(`Patagonia Better Sweater fleece jacket ${i}`, p)),
      ...[20, 22, 24, 26].map((p, i) => comp(`Patagonia tee shirt ${i}`, p)),
    ];
    const s = suggestPrice({ currency: 'USD', condition: null, comps, item: { title: 'Better Sweater fleece', brand: 'Patagonia' }, now })!;
    expect(s.suggested).toBeGreaterThan(50);
  });
  it('moves prices toward this item’s condition and counts recent sales more', () => {
    const nwt = Array.from({ length: 6 }, (_, i) => comp(`hoodie ${i}`, 40, { condition: 'new_with_tags' }));
    const asNew = suggestPrice({ currency: 'USD', condition: 'new_with_tags', comps: nwt, now })!;
    const asFair = suggestPrice({ currency: 'USD', condition: 'fair', comps: nwt, now })!;
    expect(asFair.suggested).toBeLessThan(asNew.suggested);
    const mixed = [
      ...[50, 52, 54].map((p, i) => comp(`a${i}`, p, { sold_at: '2026-10-20T00:00:00Z' })),
      ...[20, 22, 24].map((p, i) => comp(`b${i}`, p, { sold_at: '2023-01-01T00:00:00Z' })),
    ];
    expect(suggestPrice({ currency: 'USD', condition: null, comps: mixed, now })!.suggested).toBeGreaterThan(37);
  });
  it('says how long similar pieces took to sell', () => {
    const comps = [2, 4, 6, 8].map((d, i) =>
      comp(`x${i}`, 30, { listed_at: '2026-10-01T00:00:00Z', sold_at: new Date(Date.UTC(2026, 9, 1 + d)).toISOString() }),
    );
    expect(suggestPrice({ currency: 'USD', condition: null, comps, now })!.days_to_sell).toBe(5);
  });
});

describe('comparables from marketplaces', () => {
  it('reads Poshmark’s search state', () => {
    const state = {
      $_search: {
        gridData: {
          data: [
            {
              id: 'abc123',
              title: 'Levi’s 501  Jeans',
              price_amount: { val: '35.0', currency_code: 'USD' },
              condition: 'uln',
              size: '32',
              first_published_at: '2026-10-01T10:00:00-07:00',
              inventory: { status: 'sold_out', status_changed_at: '2026-10-05T10:00:00-07:00' },
            },
            { id: 'def', title: 'Live one', price_amount: { val: '20', currency_code: 'USD' }, inventory: { status: 'available' } },
            { id: 'bad', title: 'No price', price_amount: {} },
          ],
        },
      },
    };
    const html = `<script>window.__INITIAL_STATE__=${JSON.stringify(state).replace('Jeans', 'Jeans \\"}{'
    )};(function(){var s;}());</script>`;
    const comps = parsePoshmarkSearch(html);
    expect(comps).toHaveLength(2);
    expect(comps[0]).toMatchObject({
      source: 'poshmark',
      price: 35,
      sold: true,
      condition: 'excellent',
      size: '32',
      url: 'https://poshmark.com/listing/abc123',
      sold_at: '2026-10-05T17:00:00.000Z',
    });
    expect(comps[0]!.title).toContain('"}{');
    expect(comps[1]).toMatchObject({ sold: false, sold_at: null });
    expect(parsePoshmarkSearch('<html>captcha</html>')).toEqual([]);
  });
  it('maps marketplaces’ condition words', () => {
    expect(conditionFromText('New with tags')).toBe('new_with_tags');
    expect(conditionFromText('New (Other)')).toBe('new_without_tags');
    expect(conditionFromText('Pre-owned - Excellent')).toBe('excellent');
    expect(conditionFromText('Pre-Owned')).toBe('good');
    expect(conditionFromText('Pre-owned - Fair')).toBe('fair');
    expect(conditionFromText('')).toBeNull();
  });
  it('checks comparables from every marketplace the extension reads', () => {
    const out = sanitizeClientComps([
      { source: 'poshmark', title: 'A', price: 30, currency: 'USD', url: 'https://poshmark.com/listing/1', sold: true, sold_at: '2026-10-01T00:00:00Z', condition: 'good', size: 'M' },
      { source: 'mercari', title: 'B', price: 25, currency: 'USD', url: 'https://www.mercari.com/us/item/m1/', sold: true },
      { source: 'depop', title: 'C', price: 40, currency: 'USD', url: 'https://www.depop.com/products/x/', sold: true },
      { source: 'grailed', title: 'D', price: 40, currency: 'USD' },
      { source: 'poshmark', title: 'E', price: 30, currency: 'USD', url: 'https://evil.example/', condition: 'mint', sold_at: 'yesterday' },
    ]);
    expect(out.map(c => [c.source, c.sold])).toEqual([
      ['poshmark', true],
      ['mercari', true],
      ['depop', false],
      ['poshmark', true],
    ]);
    expect(out[0]).toMatchObject({ condition: 'good', size: 'M', sold_at: '2026-10-01T00:00:00.000Z' });
    expect(out[3]).toEqual({ source: 'poshmark', title: 'E', price: 30, currency: 'USD', url: null, sold: true });
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

describe('measurement estimates', () => {
  it('keeps plausible estimates, rounds them and drops absurd ones', () => {
    const scan = normalizeScan(
      {
        title: 'Grey crewneck sweatshirt',
        category: 'tops',
        estimated_measurements: { pit_to_pit: '22.3', length: 27, sleeve: 400, waist: -3, shoulder: 'wide', basis: 'Size L on a US chart' },
      },
      'USD',
      'in',
    );
    expect(scan.estimated_measurements).toEqual({ unit: 'in', basis: 'Size L on a US chart', pit_to_pit: 22.5, length: 27 });
  });
  it('checks ranges in the unit asked for', () => {
    expect(normalizeEstimate({ pit_to_pit: 22 }, 'in')?.pit_to_pit).toBe(22);
    // 12 cm is no garment's pit to pit; 12 in is a small child's.
    expect(normalizeEstimate({ pit_to_pit: 12 }, 'cm')).toBeNull();
    expect(normalizeEstimate({ pit_to_pit: 12 }, 'in')?.pit_to_pit).toBe(12);
    expect(normalizeEstimate({ pit_to_pit: 56 }, 'cm')?.pit_to_pit).toBe(56);
    expect(normalizeEstimate({ inseam: 90 }, 'in')).toBeNull();
    expect(normalizeEstimate(null, 'in')).toBeNull();
  });
  it('never estimates shoes, bags or accessories', () => {
    const scan = normalizeScan({ title: 'Nike trainers', category: 'shoes', estimated_measurements: { length: 30 } }, 'USD', 'cm');
    expect(scan.estimated_measurements).toBeNull();
  });
  it('marks estimated values until the seller changes them', () => {
    const m = measurementsFromEstimate({ unit: 'in', basis: null, pit_to_pit: 21, length: 28, sleeve: null })!;
    expect(m).toEqual({ unit: 'in', pit_to_pit: 21, length: 28, estimated: ['pit_to_pit', 'length'] });
    expect(isEstimated(m, 'length')).toBe(true);
    const measured = setMeasurement(m, 'length', 29);
    expect(measured.estimated).toEqual(['pit_to_pit']);
    expect(measured.length).toBe(29);
    expect(setMeasurement(measured, 'pit_to_pit', 21).estimated).toBeUndefined();
    expect(clearEstimates(m)).toEqual({ unit: 'in' });
    expect(measurementsFromEstimate(null)).toBeNull();
  });
  it('labels estimated measurements approximate in listings', () => {
    expect(measurementLines({ unit: 'in', pit_to_pit: 22, length: 26.5, estimated: ['length'] })).toEqual([
      'Pit to pit: 22 in',
      'Length: approx. 26.5 in',
    ]);
    const listing = generateListing(baseItem({ measurements: { unit: 'cm', pit_to_pit: 56, estimated: ['pit_to_pit'] } }), 'ebay');
    expect(listing.description).toContain('Pit to pit: approx. 56 cm');
  });
  it('captions photos by role for the model', () => {
    expect(photoCaption('label', 2)).toMatch(/^Photo 3: the clothing label/);
    expect(photoCaption(null, 0)).toBe('Photo 1.');
    expect(scanUserPrompt('GBP', null, 'cm')).toContain('Measurements in centimetres');
  });
});
