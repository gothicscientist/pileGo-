// Generated from packages/core/src by scripts/sync-core.mjs. Do not edit.
import { MARKETPLACES, type FeeRule } from './marketplaces.ts';
import { roundPrice } from './text.ts';
import type { Condition, MarketplaceId, PriceComp, PriceSuggestion, Profile } from './types.ts';

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

export interface SuggestInput {
  currency: string;
  condition: Condition | null;
  ai?: { low: number; high: number; suggested: number } | null;
  /** Active and sold listings of comparable items. */
  comps?: PriceComp[];
  /** What the seller got for similar items before. */
  own_sales?: number[];
  /** Listed this many days without selling. */
  days_listed?: number;
  now?: Date;
}

/**
 * Blend the AI estimate, comparable listings and the seller's own history into
 * one asking price with a range. Active listings are asking prices, not sale
 * prices, so they are discounted; sold comps and the seller's own sales count
 * fully.
 */
export function suggestPrice(input: SuggestInput): PriceSuggestion | null {
  const reasons: string[] = [];
  const weighted: Array<{ value: number; weight: number }> = [];

  const comps = (input.comps ?? []).filter(c => c.price > 0 && c.currency === input.currency);
  const sold = comps.filter(c => c.sold).map(c => c.price);
  const active = comps.filter(c => !c.sold).map(c => c.price);

  const soldMedian = median(sold);
  if (soldMedian != null) {
    weighted.push({ value: soldMedian, weight: Math.min(3, 1 + sold.length / 4) });
    reasons.push(`${sold.length} similar ${sold.length === 1 ? 'item' : 'items'} sold for a median of ${soldMedian.toFixed(0)} ${input.currency}.`);
  }

  const activeMedian = median(active);
  if (activeMedian != null) {
    // Asking prices run high; sellers usually take 10–20% less.
    const adjusted = activeMedian * 0.85;
    weighted.push({ value: adjusted, weight: Math.min(2, 0.5 + active.length / 8) });
    reasons.push(`${active.length} similar ${active.length === 1 ? 'listing is' : 'listings are'} asking a median of ${activeMedian.toFixed(0)} ${input.currency}.`);
  }

  const ownMedian = median(input.own_sales ?? []);
  if (ownMedian != null) {
    weighted.push({ value: ownMedian, weight: 1.5 });
    reasons.push(`You sold ${input.own_sales!.length} similar ${input.own_sales!.length === 1 ? 'item' : 'items'} for a median of ${ownMedian.toFixed(0)} ${input.currency}.`);
  }

  if (input.ai && input.ai.suggested > 0) {
    weighted.push({ value: input.ai.suggested, weight: weighted.length ? 0.75 : 1 });
    reasons.push(`The photo scan estimated ${input.ai.low.toFixed(0)} to ${input.ai.high.toFixed(0)} ${input.currency}.`);
  }

  if (!weighted.length) return null;

  const total = weighted.reduce((s, w) => s + w.weight, 0);
  let suggested = weighted.reduce((s, w) => s + w.value * w.weight, 0) / total;

  if (input.condition === 'new_with_tags') suggested *= 1.1;
  if (input.condition === 'fair') suggested *= 0.85;

  if ((input.days_listed ?? 0) >= 60) {
    suggested *= 0.85;
    reasons.push(`It has been listed for ${input.days_listed} days, so the price drops 15%.`);
  } else if ((input.days_listed ?? 0) >= 30) {
    suggested *= 0.92;
    reasons.push(`It has been listed for ${input.days_listed} days, so the price drops 8%.`);
  }

  const spreadSource = [...sold, ...active.map(v => v * 0.85)];
  const low = percentile(spreadSource, 25) ?? input.ai?.low ?? suggested * 0.8;
  const high = percentile(spreadSource, 75) ?? input.ai?.high ?? suggested * 1.2;

  const evidence = sold.length + active.length + (input.own_sales?.length ?? 0);
  const confidence: PriceSuggestion['confidence'] =
    sold.length >= 5 || evidence >= 12 ? 'high' : evidence >= 4 ? 'medium' : 'low';

  return {
    suggested: roundPrice(suggested),
    low: roundPrice(Math.min(low, suggested)),
    high: roundPrice(Math.max(high, suggested)),
    currency: input.currency,
    confidence,
    reasons,
    comps_used: evidence,
    computed_at: (input.now ?? new Date()).toISOString(),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
