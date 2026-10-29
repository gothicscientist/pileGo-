import { MARKETPLACES, type FeeRule } from './marketplaces.ts';
import { findSubcategory } from './taxonomy.ts';
import { roundPrice } from './text.ts';
import type { Condition, Item, MarketplaceId, PriceComp, PriceSuggestion, Profile } from './types.ts';

type Region = Profile['region'];
type Overrides = Profile['fee_overrides'];

export function feeRule(id: MarketplaceId, region: Region, overrides?: Overrides): FeeRule {
  const custom = overrides?.[id];
  if (custom) return { percent: custom.percent, fixed: custom.fixed };
  const fees = MARKETPLACES[id].fees;
  return fees[region] ?? fees.US ?? Object.values(fees)[0] ?? { percent: 0, fixed: 0 };
}

/** Estimated fee the seller pays on a sale at `price`. */
export function feeFor(price: number, rule: FeeRule): number {
  if (price <= 0) return 0;
  if (rule.flat_under && price < rule.flat_under.price) return rule.flat_under.fee;
  const fee = (price * rule.percent) / 100 + rule.fixed;
  return Math.max(fee, rule.min ?? 0);
}

export function takeHome(price: number, rule: FeeRule): number {
  return Math.max(0, round2(price - feeFor(price, rule)));
}

/** The price that leaves `target` after fees, the inverse of takeHome. */
export function priceForTakeHome(target: number, rule: FeeRule): number {
  if (target <= 0) return 0;
  if (rule.flat_under && target + rule.flat_under.fee < rule.flat_under.price) {
    return round2(target + rule.flat_under.fee);
  }
  const byPercent = (target + rule.fixed) / (1 - rule.percent / 100);
  const byMin = target + (rule.min ?? 0);
  return round2(Math.max(byPercent, byMin));
}

export type PriceStrategy = 'same' | 'match_take_home';

/**
 * The price to ask on one marketplace. With "match_take_home" the price is
 * raised on high-fee marketplaces so the seller nets about what the base
 * price nets on the cheapest one.
 */
export function priceOn(
  basePrice: number,
  id: MarketplaceId,
  region: Region,
  strategy: PriceStrategy,
  overrides?: Overrides,
): number {
  if (strategy === 'same' || basePrice <= 0) return basePrice;
  const target = takeHome(basePrice, cheapestRule(region, overrides));
  return roundPrice(priceForTakeHome(target, feeRule(id, region, overrides)));
}

function cheapestRule(region: Region, overrides?: Overrides): FeeRule {
  let best: FeeRule = { percent: 0, fixed: 0 };
  let bestFee = Infinity;
  for (const id of Object.keys(MARKETPLACES) as MarketplaceId[]) {
    const rule = feeRule(id, region, overrides);
    const fee = feeFor(50, rule);
    if (fee < bestFee) {
      bestFee = fee;
      best = rule;
    }
  }
  return best;
}

export function median(values: number[]): number | null {
  const sorted = values.filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function percentile(values: number[], p: number): number | null {
  const sorted = values.filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx]!;
}

/** Linear-interpolated quantile, q from 0 to 1. */
function quantile(values: number[], q: number): number {
  const v = values.filter(x => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!v.length) return 0;
  const pos = (v.length - 1) * Math.min(1, Math.max(0, q));
  const base = Math.floor(pos);
  const next = v[base + 1];
  return next === undefined ? v[base]! : v[base]! + (pos - base) * (next - v[base]!);
}

// ---------------------------------------------------------------------------
// Comparables
// ---------------------------------------------------------------------------

type CompItem = Pick<Item, 'brand' | 'department' | 'category' | 'subcategory' | 'title' | 'size'>;

const GENERIC_WORDS = new Set([
  'a', 'an', 'and', 'the', 'with', 'for', 'of', 'in', 'on', 'by', 'size', 'sz', 'mens', "men's", 'men', 'womens',
  "women's", 'women', 'ladies', 'unisex', 'kids', 'new', 'used', 'nwt', 'nwot', 'euc', 'guc', 'great', 'good',
  'condition', 'rare', 'excellent', 'authentic', 'genuine', 'cute', 'nice', 'beautiful', 'item', 'untitled',
]);

const LETTER_SIZE = /^(xxs|xs|s|m|l|xl|xxl|2xl|xxxl|3xl|4xl)$/i;

function normLetterSize(size: string | null | undefined): string | null {
  if (!size) return null;
  const t = size.trim().toLowerCase().replace(/^size\s*/, '').replace(/^(us|uk|eu)\s*/, '');
  const named: Record<string, string> = {
    small: 's',
    medium: 'm',
    large: 'l',
    'x-small': 'xs',
    'extra small': 'xs',
    'x-large': 'xl',
    'extra large': 'xl',
    'xx-large': 'xxl',
  };
  const v = named[t] ?? t;
  if (!LETTER_SIZE.test(v)) return null;
  return v === '2xl' ? 'xxl' : v === '3xl' ? 'xxxl' : v;
}

function titleWords(title: string, brand: string | null, size: string | null): string[] {
  const skip = new Set(
    [brand, size]
      .filter((x): x is string => Boolean(x))
      .flatMap(x => x.toLowerCase().split(/\s+/)),
  );
  const out: string[] = [];
  for (const raw of title.split(/[\s,/|()]+/)) {
    const w = raw.replace(/^[^\w']+|[^\w']+$/g, '');
    const lower = w.toLowerCase();
    if (w.length < 2 || GENERIC_WORDS.has(lower) || skip.has(lower) || LETTER_SIZE.test(w)) continue;
    if (out.some(o => o.toLowerCase() === lower)) continue;
    out.push(w);
  }
  return out;
}

/**
 * The search a buyer would type to find this piece: brand, the words in the
 * title that set it apart, and the kind of garment. The size stays out of the
 * query, because sellers write sizes in ways search does not match; each
 * result's title is checked for size instead (see cleanComps). `broad` is the
 * fallback when the precise search finds too little.
 */
export function compQuery(item: CompItem, opts: { broad?: boolean } = {}): string {
  const sub = findSubcategory(item.category, item.subcategory);
  const words = titleWords(item.title ?? '', item.brand, item.size);
  const dept = item.department === 'women' ? 'womens' : item.department === 'men' ? 'mens' : null;
  const subLabel = sub?.label ?? null;
  const subStem = subLabel?.toLowerCase().split(' ').at(-1)?.replace(/e?s$/, '') ?? '';
  const subInTitle = subStem.length > 2 && words.some(w => w.toLowerCase().startsWith(subStem));
  const parts = opts.broad
    ? [item.brand, subLabel ?? words.slice(0, 2).join(' ')]
    : [item.brand, dept, ...words.slice(0, 5), subInTitle ? null : subLabel];
  return parts
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

const LOT_PATTERN =
  /\b(lot|lots|bundle|bulk|wholesale|mystery|set of|pack of|\d+\s*(pcs|pieces|pack|items)|for parts|reseller)\b/i;

/** A listing that sells several pieces, or broken ones, is no guide to one piece's price. */
export function looksLikeLot(title: string): boolean {
  return LOT_PATTERN.test(title);
}

/** Letter sizes a title names, in lower case ("m", "xl"). */
export function sizesInTitle(title: string): string[] {
  const found = new Set<string>();
  for (const m of title.matchAll(/\b(?:size|sz)[:.\s]*([a-z0-9-]{1,4})\b/gi)) {
    const v = normLetterSize(m[1]);
    if (v) found.add(v);
  }
  // Bare tokens count only in capitals, so words like "a" or "m" never do.
  for (const m of title.matchAll(/(?:^|[\s,(/])(XXS|XS|S|M|L|XL|XXL|2XL|XXXL|3XL)(?=$|[\s,)/])/g)) {
    const v = normLetterSize(m[1]);
    if (v) found.add(v);
  }
  return [...found];
}

/** Drop prices far from the rest: outside 1.5 IQR of the middle half, or more than 3x off the median. */
export function trimOutliers(values: number[]): number[] {
  const sorted = values.filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (sorted.length < 4) return sorted;
  const mid = median(sorted)!;
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lo = Math.max(q1 - 1.5 * iqr, mid / 3);
  const hi = Math.min(q3 + 1.5 * iqr, mid * 3);
  return sorted.filter(v => v >= lo && v <= hi);
}

export interface CleanedComps {
  /** Sold prices, sorted. */
  sold: number[];
  /** Asking prices of live listings, sorted. */
  asking: number[];
  dropped: number;
}

/**
 * Keep the comparables that say something about this piece: the seller's
 * currency, one piece rather than a bundle, the same letter size when the
 * title names one, and nothing wildly off the rest.
 */
export function cleanComps(comps: PriceComp[], opts: { currency: string; size?: string | null }): CleanedComps {
  const want = normLetterSize(opts.size);
  const usable = comps.filter(c => c.price > 0 && c.currency === opts.currency && !looksLikeLot(c.title ?? ''));
  let kept = usable;
  if (want) {
    const sameSize = usable.filter(c => {
      const sizes = sizesInTitle(c.title ?? '');
      return !sizes.length || sizes.includes(want);
    });
    // A size filter that leaves almost nothing is worse than none.
    if (sameSize.length >= Math.min(3, usable.length)) kept = sameSize;
  }
  const sold = trimOutliers(kept.filter(c => c.sold).map(c => c.price));
  const asking = trimOutliers(kept.filter(c => !c.sold).map(c => c.price));
  return { sold, asking, dropped: comps.length - sold.length - asking.length };
}

/**
 * eBay sold prices the extension read in the seller's browser. They arrive
 * from outside the server, so every field is checked: at most 60, a real
 * price under 10,000, a currency code, a title and only eBay links.
 */
export function sanitizeSoldComps(raw: unknown): PriceComp[] {
  if (!Array.isArray(raw)) return [];
  const out: PriceComp[] = [];
  for (const c of raw.slice(0, 60)) {
    if (!c || typeof c !== 'object') continue;
    const r = c as Record<string, unknown>;
    const price = typeof r.price === 'number' ? r.price : Number(r.price);
    const currency = typeof r.currency === 'string' ? r.currency.toUpperCase() : '';
    const title = typeof r.title === 'string' ? r.title.trim().slice(0, 200) : '';
    const url = typeof r.url === 'string' && /^https:\/\/www\.ebay\.[a-z.]{2,8}\//.test(r.url) ? r.url.slice(0, 500) : null;
    if (!Number.isFinite(price) || price <= 0 || price >= 10_000 || !/^[A-Z]{3}$/.test(currency) || !title) continue;
    out.push({ source: 'ebay', title, price: round2(price), currency, url, sold: true });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Suggestion
// ---------------------------------------------------------------------------

/**
 * Photo-only estimates run high: the model knows retail and asking prices
 * better than what secondhand pieces sell for. Its number is cut by this much.
 */
export const AI_DISCOUNT = 0.8;
/** Live listings are asking prices; sellers usually take 10–20% less. */
export const ASKING_DISCOUNT = 0.85;

export interface SuggestInput {
  currency: string;
  condition: Condition | null;
  ai?: { low: number; high: number; suggested: number } | null;
  /** Active and sold listings of comparable items. */
  comps?: PriceComp[];
  /** What the seller got for similar items before. */
  own_sales?: number[];
  /** The item's size, to leave out comparables in other sizes. */
  size?: string | null;
  /** Listed this many days without selling. */
  days_listed?: number;
  now?: Date;
}

/**
 * Blend comparable listings, the seller's own history and the AI estimate
 * into one asking price, a realistic range, and the two ends of the pricing
 * slider. Sold prices count most and asking prices are discounted. The AI
 * estimate is a weak prior: discounted, and nearly ignored once there is
 * market data.
 */
export function suggestPrice(input: SuggestInput): PriceSuggestion | null {
  const reasons: string[] = [];
  const weighted: Array<{ value: number; weight: number }> = [];
  const cur = input.currency;

  const { sold, asking, dropped } = cleanComps(input.comps ?? [], { currency: cur, size: input.size });
  const own = trimOutliers(input.own_sales ?? []);
  // Sold prices from the extension and the seller's own sales are not filtered
  // by condition, so the extremes get a nudge.
  const conditionFactor = input.condition === 'new_with_tags' ? 1.1 : input.condition === 'fair' ? 0.85 : 1;

  const soldMedian = median(sold);
  if (soldMedian != null) {
    weighted.push({ value: soldMedian * conditionFactor, weight: Math.min(4, 1 + sold.length / 3) });
    reasons.push(`${sold.length} similar ${sold.length === 1 ? 'piece' : 'pieces'} sold for a median of ${fmt(soldMedian)} ${cur}.`);
  }

  const askingMedian = median(asking);
  if (askingMedian != null) {
    weighted.push({ value: askingMedian * ASKING_DISCOUNT, weight: Math.min(1.5, 0.4 + asking.length / 10) });
    reasons.push(
      `${asking.length} similar ${asking.length === 1 ? 'listing is' : 'listings are'} asking a median of ${fmt(askingMedian)} ${cur}. Asking prices run about 15% above what sells.`,
    );
  }

  const ownMedian = median(own);
  if (ownMedian != null) {
    weighted.push({ value: ownMedian, weight: Math.min(2, 0.75 + own.length / 4) });
    reasons.push(`You sold ${own.length} similar ${own.length === 1 ? 'piece' : 'pieces'} for a median of ${fmt(ownMedian)} ${cur}.`);
  }

  const market = weighted.length > 0;
  const ai = input.ai && input.ai.suggested > 0 ? input.ai : null;
  if (ai) {
    weighted.push({ value: ai.suggested * AI_DISCOUNT, weight: market ? 0.3 : 1 });
    reasons.push(
      market
        ? `The photo scan guessed ${fmt(ai.low)} to ${fmt(ai.high)} ${cur}. It counts for little next to market prices.`
        : `Only the photo scan to go on. It guessed ${fmt(ai.low)} to ${fmt(ai.high)} ${cur}, cut by 20% here because photo guesses run high.`,
    );
  }
  if (dropped > 0) {
    reasons.push(
      `Left out ${dropped} ${dropped === 1 ? 'comparable' : 'comparables'}: bundles, other sizes, other currencies or far-off prices.`,
    );
  }

  if (!weighted.length) return null;

  const total = weighted.reduce((s, w) => s + w.weight, 0);
  let suggested = weighted.reduce((s, w) => s + w.value * w.weight, 0) / total;

  let stale = 1;
  if ((input.days_listed ?? 0) >= 60) {
    stale = 0.85;
    reasons.push(`It has been listed for ${input.days_listed} days, so the price drops 15%.`);
  } else if ((input.days_listed ?? 0) >= 30) {
    stale = 0.92;
    reasons.push(`It has been listed for ${input.days_listed} days, so the price drops 8%.`);
  }
  suggested *= stale;

  // The realistic range comes from sold prices, or from discounted asking
  // prices and the seller's sales when too little has sold.
  const spread = sold.length >= 3 ? sold : [...sold, ...asking.map(v => v * ASKING_DISCOUNT), ...own];
  let low: number;
  let high: number;
  let quick: number;
  let max: number;
  if (spread.length >= 3) {
    low = quantile(spread, 0.25) * stale;
    high = quantile(spread, 0.75) * stale;
    quick = quantile(spread, 0.1) * stale;
    // Above most live listings, buyers go elsewhere.
    const askTop = asking.length >= 3 ? quantile(asking, 0.75) : Infinity;
    max = Math.min(quantile(spread, 0.9) * 1.05, askTop) * stale;
  } else if (ai && !market) {
    low = ai.low * AI_DISCOUNT * stale;
    high = ai.high * AI_DISCOUNT * stale;
    quick = low * 0.9;
    max = high;
  } else {
    low = suggested * 0.85;
    high = suggested * 1.15;
    quick = suggested * 0.75;
    max = suggested * 1.3;
  }

  const evidence = sold.length + asking.length + own.length;
  const confidence: PriceSuggestion['confidence'] =
    sold.length >= 5 || evidence >= 12 ? 'high' : evidence >= 4 ? 'medium' : 'low';

  const r = (v: number) => roundPrice(Math.max(v, 0.5));
  const s = r(suggested);
  const lowR = Math.min(r(low), s);
  const highR = Math.max(r(high), s);

  return {
    suggested: s,
    low: lowR,
    high: highR,
    quick: Math.min(r(quick), lowR),
    max: Math.max(r(max), highR),
    currency: cur,
    confidence,
    reasons,
    comps_used: evidence,
    computed_at: (input.now ?? new Date()).toISOString(),
    sold_prices: sold.slice(0, 60).map(round2),
    asking_prices: asking.slice(0, 60).map(round2),
    sources: { sold: sold.length, asking: asking.length, own: own.length, ai: Boolean(ai), dropped },
  };
}

// ---------------------------------------------------------------------------
// The pricing slider: sell fast ↔ maximize profit
// ---------------------------------------------------------------------------

export type SellSpeed = 'fast' | 'steady' | 'slow' | 'stretch';

export interface PricePoint {
  /** 0 is sell fast, 1 is maximize profit. */
  position: number;
  price: number;
  /** Where the price sits among what similar pieces sell for, 0 to 1. */
  percentile: number;
  speed: SellSpeed;
  /** Plain words on how long it may take, like "Usually sells in 1–3 weeks". */
  speed_label: string;
  /** Fewer than five sold comparables: the time estimate is a rough guide. */
  rough: boolean;
  take_home: Array<{ marketplace: MarketplaceId; fee: number; keep: number }>;
}

const SPEED_BANDS: Array<{ upTo: number; speed: SellSpeed; label: string }> = [
  { upTo: 0.2, speed: 'fast', label: 'Likely sells within about a week' },
  { upTo: 0.45, speed: 'steady', label: 'Usually sells in 1–3 weeks' },
  { upTo: 0.7, speed: 'steady', label: 'Usually sells in 2–6 weeks' },
  { upTo: 0.88, speed: 'slow', label: 'Often takes 1–3 months' },
  { upTo: Infinity, speed: 'stretch', label: 'Could sit 3 months or more; expect offers below it' },
];

export function quickPrice(s: PriceSuggestion): number {
  return Math.min(s.quick ?? s.low, s.suggested);
}

export function maxPrice(s: PriceSuggestion): number {
  return Math.max(s.max ?? s.high, s.suggested);
}

/** The price at slider position `p`: sell fast at 0, the suggestion at 0.5, maximize profit at 1. */
export function priceAtPosition(s: PriceSuggestion, p: number): number {
  const t = Math.min(1, Math.max(0, p));
  const lo = quickPrice(s);
  const hi = maxPrice(s);
  const mid = s.suggested;
  const raw = t <= 0.5 ? lo + (mid - lo) * (t / 0.5) : mid + (hi - mid) * ((t - 0.5) / 0.5);
  return roundPrice(raw);
}

/** The slider position for `price`, the inverse of priceAtPosition. */
export function positionForPrice(s: PriceSuggestion, price: number): number {
  const lo = quickPrice(s);
  const hi = maxPrice(s);
  const mid = s.suggested;
  if (price <= lo) return 0;
  if (price >= hi) return 1;
  if (price <= mid) return mid > lo ? ((price - lo) / (mid - lo)) * 0.5 : 0.5;
  return hi > mid ? 0.5 + ((price - mid) / (hi - mid)) * 0.5 : 0.5;
}

/** Share of sales below `price`, with ties counting half. */
function shareBelow(sorted: number[], price: number): number {
  let below = 0;
  let equal = 0;
  for (const v of sorted) {
    if (v < price) below++;
    else if (v === price) equal++;
  }
  return (below + equal / 2) / sorted.length;
}

/**
 * What a price at slider position `p` means: where it sits among what similar
 * pieces sold for, roughly how long it may take, and what the seller keeps on
 * each marketplace given.
 */
export function pricePoint(
  s: PriceSuggestion,
  p: number,
  fees: Array<{ id: MarketplaceId; rule: FeeRule }> = [],
): PricePoint {
  const price = priceAtPosition(s, p);
  const sold = s.sold_prices ?? [];
  const rough = sold.length < 5;
  let pct: number;
  if (!rough) {
    pct = shareBelow(sold, price);
  } else if (s.high > s.low) {
    // Too few sales to rank against: low and high stand for the 25th and
    // 75th percentile of what sells.
    pct = 0.25 + ((price - s.low) / (s.high - s.low)) * 0.5;
  } else {
    pct = positionForPrice(s, price);
  }
  pct = Math.min(1, Math.max(0, pct));
  const band = SPEED_BANDS.find(b => pct <= b.upTo)!;
  return {
    position: Math.min(1, Math.max(0, p)),
    price,
    percentile: pct,
    speed: band.speed,
    speed_label: band.label,
    rough,
    take_home: fees.map(({ id, rule }) => ({ marketplace: id, fee: round2(feeFor(price, rule)), keep: takeHome(price, rule) })),
  };
}

/** Evenly spaced points along the slider, from sell fast to maximize profit. */
export function priceLadder(
  s: PriceSuggestion,
  steps = 5,
  fees: Array<{ id: MarketplaceId; rule: FeeRule }> = [],
): PricePoint[] {
  const n = Math.max(2, Math.round(steps));
  return Array.from({ length: n }, (_, i) => pricePoint(s, i / (n - 1), fees));
}

function fmt(value: number): string {
  return value.toFixed(0);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
