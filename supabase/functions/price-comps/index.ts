// Price an item from comparable eBay listings, sold prices the extension read
// in the seller's browser, the seller's own sales and the AI estimate. eBay's
// sold-price API (Marketplace Insights) is restricted, so the server only sees
// active listings; those are discounted in the blend.
//
// POST { item_id, client_comps? } → { suggestion, comps, sources, error }

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import { compQuery, sanitizeSoldComps, suggestPrice } from '../_shared/core/pricing.ts';
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

const MIN_RESULTS = 5;

type Summary = { ebay_configured: boolean; asking: number; sold: number; own_sales: number; notes: string[] };

async function ebaySearch(item: Item, region: string, q: string): Promise<PriceComp[]> {
  const site = siteFor(region);
  const filters = ['buyingOptions:{FIXED_PRICE}', `priceCurrency:${site.currency}`];
  if (item.condition && CONDITION_FILTER[item.condition]) filters.push(`conditionIds:${CONDITION_FILTER[item.condition]}`);
  const r = await ebay<{
    itemSummaries?: Array<{ title: string; price?: { value: string; currency: string }; itemWebUrl?: string }>;
  }>({
    path: '/buy/browse/v1/item_summary/search',
    token: await getAppToken(),
    site,
    query: { q, filter: filters.join(','), limit: 50 },
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

/** Live eBay listings: the precise search first, then a broader one if it finds too little. */
async function ebayComps(item: Item, region: string): Promise<{ comps: PriceComp[]; query: string }> {
  const query = compQuery(item);
  let comps = await ebaySearch(item, region, query);
  const broad = compQuery(item, { broad: true });
  if (comps.length < MIN_RESULTS && broad && broad !== query) {
    const seen = new Set(comps.map(c => c.url ?? c.title));
    for (const c of await ebaySearch(item, region, broad)) {
      if (!seen.has(c.url ?? c.title)) comps.push(c);
    }
    comps = comps.slice(0, 80);
  }
  return { comps, query };
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
  if (item.brand && item.subcategory) q = q.ilike('brand', item.brand).eq('subcategory', item.subcategory);
  else if (item.brand) q = q.ilike('brand', item.brand);
  else if (item.subcategory) q = q.eq('subcategory', item.subcategory);
  else return [];
  const { data } = await q;
  return (data ?? []).map(r => Number(r.sold_price)).filter(n => n > 0);
}

serve(async req => {
  if (req.method !== 'POST') throw new HttpError(405, 'Use POST.');
  const { db } = await requireUser(req);
  const { item_id, client_comps } = await readJson<{ item_id: string; client_comps?: unknown }>(req);
  const { data: row } = await db.from('items').select('*').eq('id', item_id).maybeSingle();
  if (!row) throw new HttpError(404, 'Item not found.');
  const item = row as Item;
  const { data: profile } = await db.from('profiles').select('region').maybeSingle();

  const summary: Summary = { ebay_configured: ebayConfigured(), asking: 0, sold: 0, own_sales: 0, notes: [] };
  let comps: PriceComp[] = [];
  let query = compQuery(item);
  let compsError: string | null = null;
  if (summary.ebay_configured) {
    try {
      ({ comps, query } = await ebayComps(item, profile?.region ?? 'US'));
    } catch (err) {
      compsError = err instanceof Error ? err.message : String(err);
      console.warn('eBay comps failed', compsError);
      summary.notes.push('eBay did not answer, so live eBay listings are missing this time.');
    }
  } else {
    summary.notes.push('eBay is not connected on this server yet, so live eBay listings are not included.');
  }
  summary.asking = comps.length;

  const sold = sanitizeSoldComps(client_comps);
  summary.sold = sold.length;
  if (client_comps === undefined) {
    summary.notes.push('Install the pileGo extension to include recent eBay sold prices.');
  } else if (!sold.length) {
    summary.notes.push('The extension found no recent eBay sales for this search.');
  }
  comps = [...sold, ...comps];

  const own = await ownSales(db, item);
  summary.own_sales = own.length;
  const { data: listings } = await db.from('listings').select('listed_at').eq('item_id', item_id).not('listed_at', 'is', null);
  const firstListed = (listings ?? []).map(l => Date.parse(l.listed_at!)).sort()[0];
  const daysListed = firstListed ? Math.floor((Date.now() - firstListed) / 86400_000) : 0;

  const suggestion = suggestPrice({
    currency: item.currency,
    condition: item.condition,
    ai: item.ai?.price ?? null,
    comps,
    own_sales: own,
    size: item.size,
    days_listed: daysListed,
  });
  if (!suggestion) {
    return json(req, {
      suggestion: null,
      comps: comps.slice(0, 30),
      sources: summary,
      error: compsError ?? 'Not enough information yet. Scan the item, or add a brand and type, then check again.',
    });
  }
  await db.from('items').update({ price_suggestion: suggestion }).eq('id', item_id);
  await db.from('price_comps').insert({ item_id, source: 'ebay', comps, query });
  // Sold first, then the cheapest asking prices: the most useful to see.
  const shown = [...comps].sort((a, b) => Number(b.sold) - Number(a.sold) || a.price - b.price).slice(0, 30);
  return json(req, { suggestion, comps: shown, sources: summary, error: compsError });
});
