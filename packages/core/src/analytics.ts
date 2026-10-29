import { feeFor, feeRule } from './pricing.ts';
import type { Item, Listing, MarketplaceId, Profile } from './types.ts';

const DAY = 86_400_000;

export interface Breakdown {
  key: string;
  count: number;
  revenue: number;
  profit: number;
}

export interface MonthPoint {
  /** First day of the month, YYYY-MM-01. */
  month: string;
  revenue: number;
  profit: number;
  sold: number;
  listed: number;
}

export interface AgingBucket {
  label: string;
  min: number;
  max: number | null;
  count: number;
  value: number;
}

export interface Analytics {
  currency: string;
  in_closet: number;
  listed: number;
  sold: number;
  revenue: number;
  fees: number;
  cost_of_sold: number;
  profit: number;
  sell_through: number | null;
  median_days_to_sell: number | null;
  listed_value: number;
  by_marketplace: Breakdown[];
  by_brand: Breakdown[];
  by_category: Breakdown[];
  months: MonthPoint[];
  aging: AgingBucket[];
  stale: Array<{ item_id: string; title: string; days: number; price: number | null }>;
}

export interface AnalyticsOptions {
  region: Profile['region'];
  fee_overrides?: Profile['fee_overrides'];
  stale_after_days?: number;
  /** Only count sales on or after this date. */
  since?: Date | null;
  now?: Date;
  months?: number;
}

function firstListedAt(item: Item, listings: Listing[]): number {
  const times = listings
    .filter(l => l.item_id === item.id && l.listed_at)
    .map(l => Date.parse(l.listed_at!))
    .filter(Number.isFinite);
  return times.length ? Math.min(...times) : Date.parse(item.created_at);
}

function monthKey(time: number): string {
  const d = new Date(time);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function computeAnalytics(items: Item[], listings: Listing[], options: AnalyticsOptions): Analytics {
  const now = (options.now ?? new Date()).getTime();
  const since = options.since ? options.since.getTime() : null;
  const staleAfter = options.stale_after_days ?? 30;
  const currency = items.find(i => i.currency)?.currency ?? 'USD';

  const soldItems = items.filter(
    i => (i.status === 'sold' || i.status === 'shipped') && i.sold_at && (since == null || Date.parse(i.sold_at) >= since),
  );
  const activeItems = items.filter(i => i.status === 'listed');
  const closetItems = items.filter(i => i.status !== 'archived' && i.status !== 'sold' && i.status !== 'shipped');

  const feeOf = (item: Item) => {
    if (!item.sold_price || !item.sold_marketplace) return 0;
    return feeFor(item.sold_price, feeRule(item.sold_marketplace, options.region, options.fee_overrides));
  };

  let revenue = 0;
  let fees = 0;
  let cost = 0;
  const daysToSell: number[] = [];
  const groups = {
    marketplace: new Map<string, Breakdown>(),
    brand: new Map<string, Breakdown>(),
    category: new Map<string, Breakdown>(),
  };
  const bump = (map: Map<string, Breakdown>, key: string, rev: number, profit: number) => {
    const row = map.get(key) ?? { key, count: 0, revenue: 0, profit: 0 };
    row.count += 1;
    row.revenue += rev;
    row.profit += profit;
    map.set(key, row);
  };

  for (const item of soldItems) {
    const price = item.sold_price ?? item.price ?? 0;
    const fee = feeOf(item);
    const itemCost = item.cost ?? 0;
    revenue += price;
    fees += fee;
    cost += itemCost;
    const profit = price - fee - itemCost;
    bump(groups.marketplace, item.sold_marketplace ?? 'unknown', price, profit);
    bump(groups.brand, item.brand?.trim() || 'Unbranded', price, profit);
    bump(groups.category, item.category ?? 'other', price, profit);
    const listedAt = firstListedAt(item, listings);
    const soldAt = Date.parse(item.sold_at!);
    if (Number.isFinite(listedAt) && soldAt >= listedAt) daysToSell.push((soldAt - listedAt) / DAY);
  }

  daysToSell.sort((a, b) => a - b);
  const median =
    daysToSell.length === 0
      ? null
      : daysToSell.length % 2
        ? daysToSell[(daysToSell.length - 1) / 2]!
        : (daysToSell[daysToSell.length / 2 - 1]! + daysToSell[daysToSell.length / 2]!) / 2;

  const sellThrough =
    soldItems.length + activeItems.length > 0 ? soldItems.length / (soldItems.length + activeItems.length) : null;

  // Monthly series, oldest first.
  const monthCount = options.months ?? 12;
  const months: MonthPoint[] = [];
  const nowDate = new Date(now);
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() - i, 1));
    months.push({ month: monthKey(d.getTime()), revenue: 0, profit: 0, sold: 0, listed: 0 });
  }
  const monthIndex = new Map(months.map((m, idx) => [m.month, idx]));
  for (const item of items) {
    if (item.sold_at && (item.status === 'sold' || item.status === 'shipped')) {
      const idx = monthIndex.get(monthKey(Date.parse(item.sold_at)));
      if (idx != null) {
        const price = item.sold_price ?? item.price ?? 0;
        months[idx]!.revenue += price;
        months[idx]!.profit += price - feeOf(item) - (item.cost ?? 0);
        months[idx]!.sold += 1;
      }
    }
  }
  for (const listing of listings) {
    if (!listing.listed_at) continue;
    const idx = monthIndex.get(monthKey(Date.parse(listing.listed_at)));
    if (idx != null) months[idx]!.listed += 1;
  }

  const aging: AgingBucket[] = [
    { label: 'Under 30 days', min: 0, max: 30, count: 0, value: 0 },
    { label: '30 to 60 days', min: 30, max: 60, count: 0, value: 0 },
    { label: '60 to 90 days', min: 60, max: 90, count: 0, value: 0 },
    { label: 'Over 90 days', min: 90, max: null, count: 0, value: 0 },
  ];
  const stale: Analytics['stale'] = [];
  let listedValue = 0;
  for (const item of activeItems) {
    const days = (now - firstListedAt(item, listings)) / DAY;
    listedValue += item.price ?? 0;
    const bucket = aging.find(b => days >= b.min && (b.max == null || days < b.max));
    if (bucket) {
      bucket.count += 1;
      bucket.value += item.price ?? 0;
    }
    if (days >= staleAfter) stale.push({ item_id: item.id, title: item.title, days: Math.floor(days), price: item.price });
  }
  stale.sort((a, b) => b.days - a.days);

  const sorted = (map: Map<string, Breakdown>) => [...map.values()].sort((a, b) => b.revenue - a.revenue);

  return {
    currency,
    in_closet: closetItems.length,
    listed: activeItems.length,
    sold: soldItems.length,
    revenue: round2(revenue),
    fees: round2(fees),
    cost_of_sold: round2(cost),
    profit: round2(revenue - fees - cost),
    sell_through: sellThrough,
    median_days_to_sell: median == null ? null : Math.round(median),
    listed_value: round2(listedValue),
    by_marketplace: sorted(groups.marketplace),
    by_brand: sorted(groups.brand).slice(0, 10),
    by_category: sorted(groups.category),
    months: months.map(m => ({ ...m, revenue: round2(m.revenue), profit: round2(m.profit) })),
    aging,
    stale,
  };
}

/** Which marketplaces earned the most per item: used for "where to list next". */
export function bestMarketplaces(analytics: Analytics): MarketplaceId[] {
  return analytics.by_marketplace
    .filter(b => b.key !== 'unknown')
    .sort((a, b) => b.revenue / b.count - a.revenue / a.count)
    .map(b => b.key as MarketplaceId);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
