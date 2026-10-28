// Price an item from comparable eBay listings, the seller's own sales and the
// AI estimate. eBay's sold-price API (Marketplace Insights) is restricted, so
// comps are active listings, discounted in the blend.
//
// POST { item_id } → PriceSuggestion & { comps }

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import { suggestPrice } from '../_shared/core/pricing.ts';
import { findSubcategory } from '../_shared/core/taxonomy.ts';
import type { Item, PriceComp } from '../_shared/core/types.ts';
import { ebay, ebayConfigured, getAppToken, siteFor } from '../_shared/ebay.ts';
import { HttpError, json, readJson, serve } from '../_shared/http.ts';
import { requireUser } from '../_shared/supabase.ts';

const CONDITION_FILTER: Record<string, string> = {
  new_with_tags: '{1000}',
  new_without_tags: '{1500|1000}',
  excellent: '{2990|3000}',
  good: '{3000|2990|3010}',
  fair: '{3010|3000}',
};

function compQuery(item: Item): string {
  const sub = findSubcategory(item.category, item.subcategory);
  return [item.brand, item.department === 'women' ? 'womens' : item.department === 'men' ? 'mens' : null, sub?.label ?? item.title, item.size]
    .filter(Boolean)
    .join(' ')
    .slice(0, 100);
}

async function ebayComps(item: Item, region: string): Promise<PriceComp[]> {
  if (!ebayConfigured()) return [];
  const site = siteFor(region);
  const filters = ['buyingOptions:{FIXED_PRICE}', `priceCurrency:${site.currency}`];
  if (item.condition && CONDITION_FILTER[item.condition]) filters.push(`conditionIds:${CONDITION_FILTER[item.condition]}`);
  const r = await ebay<{
    itemSummaries?: Array<{ title: string; price?: { value: string; currency: string }; itemWebUrl?: string }>;
  }>({
    path: '/buy/browse/v1/item_summary/search',
    token: await getAppToken(),
    site,
    query: { q: compQuery(item), filter: filters.join(','), limit: 40 },
  });
  return (r.itemSummaries ?? [])
    .filter(s => s.price)
    .map(s => ({
      source: 'ebay' as const,
      title: s.title,
      price: Number(s.price!.value),
      currency: s.price!.currency,
      url: s.itemWebUrl ?? null,
      sold: false,
    }));
}

async function ownSales(db: SupabaseClient, item: Item): Promise<number[]> {
  let q = db
    .from('items')
    .select('sold_price')
    .in('status', ['sold', 'shipped'])
    .neq('id', item.id)
    .not('sold_price', 'is', null)
    .eq('currency', item.currency)
    .limit(50);
  if (item.brand) q = q.ilike('brand', item.brand);
  else if (item.subcategory) q = q.eq('subcategory', item.subcategory);
  else return [];
  const { data } = await q;
  return (data ?? []).map(r => Number(r.sold_price)).filter(n => n > 0);
}

serve(async req => {
  if (req.method !== 'POST') throw new HttpError(405, 'Use POST.');
  const { db } = await requireUser(req);
  const { item_id } = await readJson<{ item_id: string }>(req);
  const { data: item } = await db.from('items').select('*').eq('id', item_id).maybeSingle();
  if (!item) throw new HttpError(404, 'Item not found.');
  const { data: profile } = await db.from('profiles').select('region').maybeSingle();

  let comps: PriceComp[] = [];
  let compsError: string | null = null;
  try {
    comps = await ebayComps(item as Item, profile?.region ?? 'US');
  } catch (err) {
    compsError = err instanceof Error ? err.message : String(err);
    console.warn('eBay comps failed', compsError);
  }
  const own = await ownSales(db, item as Item);
  const { data: listings } = await db.from('listings').select('listed_at').eq('item_id', item_id).not('listed_at', 'is', null);
  const firstListed = (listings ?? []).map(l => Date.parse(l.listed_at!)).sort()[0];
  const daysListed = firstListed ? Math.floor((Date.now() - firstListed) / 86400_000) : 0;

  const ai = (item as Item).ai?.price ?? null;
  const suggestion = suggestPrice({
    currency: (item as Item).currency,
    condition: (item as Item).condition,
    ai,
    comps,
    own_sales: own,
    days_listed: daysListed,
  });
  if (!suggestion) {
    return json(req, { suggestion: null, comps, error: compsError ?? 'Not enough information yet. Scan the item or add a brand.' });
  }
  await db.from('items').update({ price_suggestion: suggestion }).eq('id', item_id);
  await db.from('price_comps').insert({ item_id, source: 'ebay', comps, query: compQuery(item as Item) });
  return json(req, { suggestion, comps: comps.slice(0, 20), error: compsError });
});
