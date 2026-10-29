import { MARKETPLACES, type FeeRule } from './marketplaces.ts';
import { findSubcategory } from './taxonomy.ts';
import { roundPrice } from './text.ts';
import type { Condition, Item, MarketplaceId, PriceComp, PriceSuggestion, PriceTiers, Profile } from './types.ts';

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
  /** The sold comparables kept, in the order given. */
  soldComps: PriceComp[];
  /** The live listings kept, in the order given. */
  askingComps: PriceComp[];
  dropped: number;
}

function compSizes(c: PriceComp): string[] {
  const own = normLetterSize(c.size);
  return own ? [own] : sizesInTitle(c.title ?? '');
}

/**
 * Keep the comparables that say something about this piece: the seller's
 * currency, one piece rather than a bundle, the same letter size when the
 * listing names one, and nothing wildly off the rest.
 */
export function cleanComps(comps: PriceComp[], opts: { currency: string; size?: string | null }): CleanedComps {
  const want = normLetterSize(opts.size);
  const usable = comps.filter(c => c.price > 0 && c.currency === opts.currency && !looksLikeLot(c.title ?? ''));
  let kept = usable;
  if (want) {
    const sameSize = usable.filter(c => {
      const sizes = compSizes(c);
      return !sizes.length || sizes.includes(want);
    });
    // A size filter that leaves almost nothing is worse than none.
    if (sameSize.length >= Math.min(3, usable.length)) kept = sameSize;
  }
  const inRange = (list: PriceComp[]) => {
    const prices = trimOutliers(list.map(c => c.price));
    const lo = prices[0] ?? 0;
    const hi = prices.at(-1) ?? 0;
    return list.filter(c => c.price >= lo && c.price <= hi);
  };
  const soldComps = inRange(kept.filter(c => c.sold));
  const askingComps = inRange(kept.filter(c => !c.sold));
  const sorted = (list: PriceComp[]) => list.map(c => c.price).sort((a, b) => a - b);
  return {
    sold: sorted(soldComps),
    asking: sorted(askingComps),
    soldComps,
    askingComps,
    dropped: comps.length - soldComps.length - askingComps.length,
  };
}

const CONDITIONS: Condition[] = ['new_with_tags', 'new_without_tags', 'excellent', 'good', 'fair'];
const COMP_SOURCES: Partial<Record<PriceComp['source'], { url: RegExp; sold: boolean | null }>> = {
  ebay: { url: /^https:\/\/www\.ebay\.[a-z.]{2,8}\//, sold: true },
  poshmark: { url: /^https:\/\/poshmark\.(com|ca)\//, sold: null },
  mercari: { url: /^https:\/\/www\.mercari\.com\//, sold: null },
  // Depop's search shows live listings only.
  depop: { url: /^https:\/\/www\.depop\.com\//, sold: false },
};

function dateOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 40) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/**
 * Comparables the extension read in the seller's browser: sold prices from
 * eBay, Poshmark and Mercari, live asking prices from Depop. They arrive from
 * outside the server, so every field is checked: at most 200, a known
 * marketplace, a real price under 10,000, a currency code, a title, links
 * only to that marketplace, and dates and conditions that parse. Comparables
 * with no source are eBay sales, as older extensions sent them.
 */
export function sanitizeClientComps(raw: unknown): PriceComp[] {
  if (!Array.isArray(raw)) return [];
  const out: PriceComp[] = [];
  for (const c of raw.slice(0, 200)) {
    if (!c || typeof c !== 'object') continue;
    const r = c as Record<string, unknown>;
    const source = (r.source === undefined ? 'ebay' : r.source) as PriceComp['source'];
    const rule = typeof source === 'string' ? COMP_SOURCES[source] : undefined;
    if (!rule) continue;
    const price = typeof r.price === 'number' ? r.price : Number(r.price);
    const currency = typeof r.currency === 'string' ? r.currency.toUpperCase() : '';
    const title = typeof r.title === 'string' ? r.title.trim().slice(0, 200) : '';
    const url = typeof r.url === 'string' && rule.url.test(r.url) ? r.url.slice(0, 500) : null;
    if (!Number.isFinite(price) || price <= 0 || price >= 10_000 || !/^[A-Z]{3}$/.test(currency) || !title) continue;
    const sold = rule.sold ?? r.sold !== false;
    const comp: PriceComp = { source, title, price: round2(price), currency, url, sold };
    const soldAt = sold ? dateOrNull(r.sold_at) : null;
    const listedAt = dateOrNull(r.listed_at);
    if (soldAt) comp.sold_at = soldAt;
    if (listedAt) comp.listed_at = listedAt;
    if (CONDITIONS.includes(r.condition as Condition)) comp.condition = r.condition as Condition;
    if (typeof r.size === 'string' && r.size.trim()) comp.size = r.size.trim().slice(0, 20);
    out.push(comp);
  }
  return out;
}

/** @deprecated Use sanitizeClientComps. */
export const sanitizeSoldComps = sanitizeClientComps;

// ---------------------------------------------------------------------------
// Weighing comparables
// ---------------------------------------------------------------------------

/**
 * What each condition is worth next to "excellent", from the median price by
 * condition within the same search across 87 Poshmark searches (see
 * docs/pricing.md). A comparable's price is moved part of the way toward this
 * item's condition.
 */
export const CONDITION_VALUE: Record<Condition, number> = {
  new_with_tags: 1.3,
  new_without_tags: 1.05,
  excellent: 1,
  good: 0.91,
  fair: 0.7,
};
/** How far a comparable's price moves toward this item's condition, 0 to 1. */
export const CONDITION_ADJUST = 0.75;
/** A sale this many days old counts half as much as one today. */
export const RECENCY_HALF_LIFE_DAYS = 180;
const RECENCY_FLOOR = 0.2;
const SIMILARITY_BASE = 0.05;
const SIMILARITY_POWER = 4;

/** Where the three picker prices sit among similar sales, weighted. */
export const TIER_QUANTILES = { likely: 0.2, balanced: 0.5, less_likely: 0.75 } as const;
/**
 * The tiers as a share of the balanced price when there are too few sales to
 * read them from: the median spread across the calibration searches.
 */
export const TIER_SPREAD = { likely: 0.8, less_likely: 1.2 } as const;

function words(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().replace(/[’`]/g, "'").split(/[^a-z0-9']+/)) {
    const w = raw.replace(/^'+|'+$/g, '').replace(/'s$/, '');
    if (w.length > 1 && !GENERIC_WORDS.has(w)) out.add(w);
  }
  return out;
}

/** The words that describe the item, to compare with comparables' titles. */
export function itemWords(item: Partial<CompItem> | null | undefined): Set<string> {
  if (!item) return new Set();
  const sub = item.category ? findSubcategory(item.category, item.subcategory ?? null) : null;
  return words([item.brand, item.title, sub?.label].filter(Boolean).join(' '));
}

/** Share of the item's words a comparable's title has, 0 to 1. */
export function titleOverlap(mine: Set<string>, title: string): number {
  if (!mine.size) return 1;
  const theirs = words(title);
  let hit = 0;
  for (const w of mine) if (theirs.has(w)) hit++;
  return hit / mine.size;
}

export interface WeighedComp {
  comp: PriceComp;
  /** Its price moved toward this item's condition. */
  price: number;
  weight: number;
}

/**
 * Weigh sold comparables by how alike their titles are to this item and how
 * recently they sold, and move each price toward this item's condition.
 */
export function weighComps(
  comps: PriceComp[],
  opts: { words?: Set<string>; condition?: Condition | null; now?: Date },
): WeighedComp[] {
  const now = (opts.now ?? new Date()).getTime();
  const mine = opts.words ?? new Set<string>();
  return comps.map(comp => {
    let weight = 1;
    let price = comp.price;
    const soldAt = comp.sold_at ? Date.parse(comp.sold_at) : NaN;
    if (Number.isFinite(soldAt)) {
      const days = Math.max(0, (now - soldAt) / 86400_000);
      weight *= Math.max(RECENCY_FLOOR, 0.5 ** (days / RECENCY_HALF_LIFE_DAYS));
    }
    if (mine.size) weight *= (SIMILARITY_BASE + titleOverlap(mine, comp.title ?? '')) ** SIMILARITY_POWER;
    if (opts.condition && comp.condition && comp.condition !== opts.condition) {
      price *= (CONDITION_VALUE[opts.condition] / CONDITION_VALUE[comp.condition]) ** CONDITION_ADJUST;
    }
    return { comp, price, weight };
  });
}

/**
 * The weighted quantile q (0 to 1) of `values`: each point sits at the middle
 * of its weight, with straight lines between points.
 */
export function weightedQuantile(points: Array<{ price: number; weight: number }>, q: number): number | null {
  const pts = points.filter(p => Number.isFinite(p.price) && p.price > 0 && p.weight > 0).sort((a, b) => a.price - b.price);
  if (!pts.length) return null;
  const total = pts.reduce((s, p) => s + p.weight, 0);
  let acc = 0;
  const at = pts.map(p => {
    const mid = (acc + p.weight / 2) / total;
    acc += p.weight;
    return mid;
  });
  if (q <= at[0]!) return pts[0]!.price;
  if (q >= at.at(-1)!) return pts.at(-1)!.price;
  for (let i = 1; i < pts.length; i++) {
    if (q <= at[i]!) {
      const t = (q - at[i - 1]!) / (at[i]! - at[i - 1]!);
      return pts[i - 1]!.price + t * (pts[i]!.price - pts[i - 1]!.price);
    }
  }
  return pts.at(-1)!.price;
}

/** Effective number of comparables once weights are counted (Kish). */
function effectiveCount(points: Array<{ weight: number }>): number {
  const s = points.reduce((a, p) => a + p.weight, 0);
  const s2 = points.reduce((a, p) => a + p.weight * p.weight, 0);
  return s2 > 0 ? (s * s) / s2 : 0;
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
  /** The item, to weigh comparables by how alike their titles are. */
  item?: Partial<CompItem> | null;
  /** Listed this many days without selling. */
  days_listed?: number;
  now?: Date;
}

/**
 * Price an item the way an appraiser prices a house: from comparable sales.
 * Each sold comparable is weighed by how alike its title is and how recently
 * it sold, and its price is moved toward this item's condition. The weighted
 * median is the balanced price; the weighted quartiles are the likely-to-sell
 * and less-likely prices. Live asking prices (discounted), the seller's own
 * sales and the photo scan's guess are blended in, the scan counting for
 * little once there is market data.
 */
export function suggestPrice(input: SuggestInput): PriceSuggestion | null {
  const reasons: string[] = [];
  const blend: Array<{ value: number; weight: number }> = [];
  const cur = input.currency;
  const now = input.now ?? new Date();

  const { sold, asking, soldComps, askingComps, dropped } = cleanComps(input.comps ?? [], { currency: cur, size: input.size });
  const own = trimOutliers(input.own_sales ?? []);
  const mine = itemWords(input.item);
  const weighed = weighComps(soldComps, { words: mine, condition: input.condition, now });
  // Comparables without a condition of their own get the old nudge at the extremes.
  const nudge = input.condition === 'new_with_tags' ? 1.1 : input.condition === 'fair' ? 0.85 : 1;
  for (const w of weighed) if (!w.comp.condition) w.price *= nudge;
  const effective = effectiveCount(weighed);

  const soldCenter = weightedQuantile(weighed, 0.5);
  if (soldCenter != null) {
    blend.push({ value: soldCenter, weight: Math.min(5, 1 + effective / 3) });
    const where = soldBySource(soldComps);
    reasons.push(
      `${sold.length} similar ${sold.length === 1 ? 'piece' : 'pieces'} sold${where ? ` (${where})` : ''}. Weighed by how alike and how recent they are, and adjusted for condition, the middle is ${fmt(soldCenter)} ${cur}.`,
    );
  }

  const askingCenter = weightedQuantile(weighComps(askingComps, { words: mine, condition: input.condition, now }), 0.5);
  if (askingCenter != null) {
    blend.push({ value: askingCenter * ASKING_DISCOUNT, weight: Math.min(1.5, 0.4 + asking.length / 10) });
    reasons.push(
      `${asking.length} similar ${asking.length === 1 ? 'listing is' : 'listings are'} asking around ${fmt(askingCenter)} ${cur}. Asking prices run about 15% above what sells.`,
    );
  }

  const ownMedian = median(own);
  if (ownMedian != null) {
    blend.push({ value: ownMedian, weight: Math.min(2, 0.75 + own.length / 4) });
    reasons.push(`You sold ${own.length} similar ${own.length === 1 ? 'piece' : 'pieces'} for a median of ${fmt(ownMedian)} ${cur}.`);
  }

  const market = blend.length > 0;
  const ai = input.ai && input.ai.suggested > 0 ? input.ai : null;
  if (ai) {
    blend.push({ value: ai.suggested * AI_DISCOUNT, weight: market ? 0.3 : 1 });
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

  if (!blend.length) return null;

  const total = blend.reduce((s, w) => s + w.weight, 0);
  let suggested = blend.reduce((s, w) => s + w.value * w.weight, 0) / total;

  let stale = 1;
  if ((input.days_listed ?? 0) >= 60) {
    stale = 0.85;
    reasons.push(`It has been listed for ${input.days_listed} days, so the price drops 15%.`);
  } else if ((input.days_listed ?? 0) >= 30) {
    stale = 0.92;
    reasons.push(`It has been listed for ${input.days_listed} days, so the price drops 8%.`);
  }
  suggested *= stale;

  // The spread of what sells, as shares of the middle. Read from sold prices
  // when there are enough; else from discounted asking prices and the
  // seller's own sales; else the typical spread.
  const spreadPoints =
    effective >= 3
      ? weighed
      : [
          ...weighed,
          ...askingComps.map(c => ({ price: c.price * ASKING_DISCOUNT, weight: 0.5 })),
          ...own.map(price => ({ price, weight: 1 })),
        ];
  const mid = weightedQuantile(spreadPoints, 0.5);
  const share = (q: number) => {
    const v = weightedQuantile(spreadPoints, q);
    return v != null && mid ? v / mid : null;
  };
  const enough = spreadPoints.length >= 3;
  const aiOnly = ai && !market;
  const ratio = {
    quick: (enough && share(0.1)) || (aiOnly ? (ai.low / ai.suggested) * 0.9 : 0.7),
    likely: (enough && share(TIER_QUANTILES.likely)) || (aiOnly ? ai.low / ai.suggested : TIER_SPREAD.likely),
    less: (enough && share(TIER_QUANTILES.less_likely)) || (aiOnly ? ai.high / ai.suggested : TIER_SPREAD.less_likely),
    max: (enough && share(0.9)) || (aiOnly ? ai.high / ai.suggested : 1.35),
  };
  // Keep the cards apart and sane however lumpy the comparables are.
  const likelyShare = clamp(ratio.likely, 0.6, 0.94);
  const lessShare = clamp(ratio.less, 1.06, 1.6);
  // Above most live listings, buyers go elsewhere.
  const askTop = asking.length >= 3 ? (quantile(asking, 0.75) * stale) / suggested : Infinity;

  const evidence = sold.length + asking.length + own.length;
  const confidence: PriceSuggestion['confidence'] =
    effective >= 6 || (sold.length >= 5 && evidence >= 12) ? 'high' : evidence >= 4 ? 'medium' : 'low';

  const r = (v: number) => roundPrice(Math.max(v, 0.5));
  const balanced = r(suggested);
  const likely = Math.min(r(suggested * likelyShare), Math.max(balanced - step(balanced), 0.5));
  const lessLikely = Math.max(r(suggested * Math.min(lessShare, Math.max(askTop, 1.06))), balanced + step(balanced));

  const days = daysToSell(soldComps);
  if (days != null) reasons.push(`Similar pieces that sold took a median of ${days} ${days === 1 ? 'day' : 'days'} to sell.`);

  return {
    suggested: balanced,
    low: likely,
    high: lessLikely,
    quick: Math.min(r(suggested * clamp(ratio.quick, 0.45, 0.9)), likely),
    max: Math.max(r(suggested * Math.min(clamp(ratio.max, 1.1, 2), Math.max(askTop * 1.05, 1.1))), lessLikely),
    tiers: { likely, balanced, less_likely: lessLikely },
    currency: cur,
    confidence,
    reasons,
    comps_used: evidence,
    computed_at: now.toISOString(),
    sold_prices: sold.slice(0, 120).map(round2),
    asking_prices: asking.slice(0, 60).map(round2),
    days_to_sell: days,
    sources: {
      sold: sold.length,
      asking: asking.length,
      own: own.length,
      ai: Boolean(ai),
      dropped,
      sold_by: countBy(soldComps.map(c => c.source)),
    },
  };
}

/** The smallest price step that still reads as a different price. */
function step(price: number): number {
  return price < 10 ? 0.5 : price < 100 ? 1 : 5;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function countBy(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

function soldBySource(comps: PriceComp[]): string {
  const counts = countBy(comps.map(c => c.source));
  const names: Record<string, string> = { ebay: 'eBay', poshmark: 'Poshmark' };
  const parts = Object.entries(counts).map(([k, n]) => `${n} on ${names[k] ?? k}`);
  return parts.length > 1 ? parts.join(', ') : '';
}

/** Median days from listing to sale among sold comparables that give both dates. */
export function daysToSell(comps: PriceComp[]): number | null {
  const days = comps
    .map(c => (c.sold_at && c.listed_at ? (Date.parse(c.sold_at) - Date.parse(c.listed_at)) / 86400_000 : NaN))
    .filter(d => Number.isFinite(d) && d >= 0 && d < 3 * 365);
  if (days.length < 3) return null;
  return Math.max(1, Math.round(median(days)!));
}

// ---------------------------------------------------------------------------
// The price picker: likely to sell, balanced, less likely
// ---------------------------------------------------------------------------

/** The three picker prices. Rows saved before the picker get theirs from quick, suggested and max. */
export function priceTiers(s: PriceSuggestion): PriceTiers {
  if (s.tiers) return s.tiers;
  const balanced = s.suggested;
  return {
    likely: Math.min(s.quick ?? s.low, s.low, balanced),
    balanced,
    less_likely: Math.max(s.high, balanced),
  };
}

export type PriceTone = 'low' | 'fast' | 'fair' | 'slow' | 'high';

export interface PriceAdvice {
  tone: PriceTone;
  /** One plain sentence about the price, like eBay's hint under its price box. */
  text: string;
  /** The price the hint points to, if any. */
  target: number | null;
  /** Share of similar sales below this price, 0 to 1, when there are enough sales to say. */
  percentile: number | null;
  take_home: Array<{ marketplace: MarketplaceId; fee: number; keep: number }>;
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
 * What a price the seller typed means next to the picker: too high (with the
 * price to come down to), on the low side, or where it sits between the
 * cards; and what the seller keeps on each marketplace given.
 */
export function priceAdvice(
  s: PriceSuggestion,
  price: number,
  fees: Array<{ id: MarketplaceId; rule: FeeRule }> = [],
  money: (v: number) => string = v => `${fmt(v)} ${s.currency}`,
): PriceAdvice {
  const t = priceTiers(s);
  const sold = s.sold_prices ?? [];
  const percentile = sold.length >= 5 && price > 0 ? shareBelow(sold, price) : null;
  const take_home = fees.map(({ id, rule }) => ({ marketplace: id, fee: round2(feeFor(price, rule)), keep: takeHome(price, rule) }));
  let tone: PriceTone;
  let text: string;
  let target: number | null = null;
  if (price > t.less_likely) {
    tone = 'high';
    target = t.less_likely;
    text = `Your price is high. Try pricing at or below ${money(t.less_likely)} to help your item sell.`;
  } else if (price < roundPrice(t.likely * 0.85)) {
    tone = 'low';
    target = t.balanced;
    text = `Your price is on the low side. Similar pieces sell for about ${money(t.balanced)}, so you could ask more.`;
  } else if (price <= t.likely) {
    tone = 'fast';
    text = 'Priced to sell: below most recent sales of similar pieces.';
  } else if (price <= t.balanced) {
    tone = 'fair';
    text = 'In line with what similar pieces sell for.';
  } else {
    tone = 'slow';
    text = 'Above most recent sales. It may take longer and draw offers.';
  }
  return { tone, text, target, percentile, take_home };
}

function fmt(value: number): string {
  return value.toFixed(0);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
