// Pull new eBay orders and record each sale, which marks the item sold and
// queues delists on every other marketplace. Also imports existing eBay
// listings on request.
//
// Cron (service key): syncs every connected seller.
// POST { action?: 'sync' | 'import' } as a seller: syncs or imports only you.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import { makeSku } from '../_shared/core/sku.ts';
import { matchCategory } from '../_shared/core/taxonomy.ts';
import { ebay, EbayNotConnected, getUserToken, siteFor, trading, xmlValue, xmlValues } from '../_shared/ebay.ts';
import { json, readJson, serve } from '../_shared/http.ts';
import { adminClient, isServiceCall, requireUser } from '../_shared/supabase.ts';

interface Order {
  orderId: string;
  creationDate: string;
  orderPaymentStatus?: string;
  cancelStatus?: { cancelState?: string };
  lineItems: Array<{
    lineItemId: string;
    legacyItemId?: string;
    sku?: string;
    title?: string;
    total?: { value: string; currency: string };
    lineItemCost?: { value: string; currency: string };
  }>;
}

async function syncSeller(admin: SupabaseClient, userId: string): Promise<{ orders: number; sales: number }> {
  const { data: account } = await admin
    .from('marketplace_accounts')
    .select('meta, last_sync_at')
    .eq('user_id', userId)
    .eq('marketplace', 'ebay')
    .maybeSingle();
  const token = await getUserToken(admin, userId);
  const startedAt = new Date();
  // Overlap the last window by an hour so nothing slips between runs.
  const since = account?.last_sync_at
    ? new Date(Date.parse(account.last_sync_at) - 3600_000)
    : new Date(Date.now() - 30 * 86400_000);

  let sales = 0;
  let orders = 0;
  let offset = 0;
  for (let page = 0; page < 10; page++) {
    const r = await ebay<{ orders?: Order[]; total?: number }>({
      path: '/sell/fulfillment/v1/order',
      token,
      query: {
        filter: `creationdate:[${since.toISOString()}..]`,
        limit: 50,
        offset,
      },
    });
    const batch = r.orders ?? [];
    orders += batch.length;
    for (const order of batch) {
      if (order.cancelStatus?.cancelState === 'CANCELED') continue;
      for (const line of order.lineItems) {
        const listing = await findListing(admin, userId, line.legacyItemId, line.sku);
        if (!listing || listing.status === 'sold') continue;
        const price = Number(line.lineItemCost?.value ?? line.total?.value ?? 0) || null;
        const { error } = await admin.rpc('record_sale', {
          p_listing_id: listing.id,
          p_price: price,
          p_sold_at: order.creationDate,
          p_data: { order_id: order.orderId, line_item_id: line.lineItemId },
        });
        if (error) console.error('record_sale failed', error.message);
        else sales++;
      }
    }
    if (batch.length < 50) break;
    offset += 50;
  }

  await admin
    .from('marketplace_accounts')
    .update({ last_sync_at: startedAt.toISOString(), last_error: null, status: 'connected' })
    .eq('user_id', userId)
    .eq('marketplace', 'ebay');
  return { orders, sales };
}

async function findListing(admin: SupabaseClient, userId: string, legacyId?: string, sku?: string) {
  if (legacyId) {
    const { data } = await admin
      .from('listings')
      .select('id, status')
      .eq('user_id', userId)
      .eq('marketplace', 'ebay')
      .eq('external_id', legacyId)
      .maybeSingle();
    if (data) return data;
  }
  if (sku) {
    const { data: item } = await admin.from('items').select('id').eq('user_id', userId).eq('sku', sku).maybeSingle();
    if (item) {
      const { data } = await admin
        .from('listings')
        .select('id, status')
        .eq('item_id', item.id)
        .eq('marketplace', 'ebay')
        .maybeSingle();
      if (data) return data;
    }
  }
  return null;
}

/** Bring the seller's active eBay listings into the closet. */
async function importListings(admin: SupabaseClient, userId: string): Promise<{ imported: number; skipped: number }> {
  const { data: profile } = await admin.from('profiles').select('region, currency').eq('id', userId).maybeSingle();
  const { data: account } = await admin
    .from('marketplace_accounts')
    .select('meta')
    .eq('user_id', userId)
    .eq('marketplace', 'ebay')
    .maybeSingle();
  const site = siteFor(((account?.meta as Record<string, string>)?.region) ?? profile?.region);
  const token = await getUserToken(admin, userId);

  let imported = 0;
  let skipped = 0;
  for (let page = 1; page <= 20; page++) {
    const xml = await trading(
      'GetMyeBaySelling',
      token,
      site,
      `<ActiveList><Include>true</Include><Pagination><EntriesPerPage>100</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination></ActiveList><DetailLevel>ReturnAll</DetailLevel>`,
    );
    const blocks = xml.match(/<Item>[\s\S]*?<\/Item>/g) ?? [];
    for (const block of blocks) {
      const itemId = xmlValue(block, 'ItemID');
      if (!itemId) continue;
      const { data: existing } = await admin
        .from('listings')
        .select('id')
        .eq('user_id', userId)
        .eq('marketplace', 'ebay')
        .eq('external_id', itemId)
        .maybeSingle();
      if (existing) {
        skipped++;
        continue;
      }
      const title = xmlValue(block, 'Title') ?? 'eBay item';
      const price = Number(xmlValue(block, 'CurrentPrice') ?? xmlValue(block, 'BuyItNowPrice') ?? 0) || null;
      const currency = block.match(/<CurrentPrice currencyID="([A-Z]{3})"/)?.[1] ?? site.currency;
      const guess = matchCategory(title);
      const sku = xmlValue(block, 'SKU') || makeSku(guess?.category);
      const { data: item, error } = await admin
        .from('items')
        .insert({
          user_id: userId,
          sku,
          status: 'listed',
          title,
          category: guess?.category ?? null,
          subcategory: guess?.subcategory ?? null,
          price,
          currency,
          description: '',
          notes: 'Imported from eBay. Add photos and details to cross-list it.',
        })
        .select('id')
        .single();
      if (error) {
        // A clashing SKU means it is already here under another listing.
        skipped++;
        continue;
      }
      await admin.from('listings').insert({
        user_id: userId,
        item_id: item.id,
        marketplace: 'ebay',
        status: 'listed',
        external_id: itemId,
        external_url: xmlValue(block, 'ViewItemURL') ?? site.item_url + itemId,
        title,
        price,
        listed_at: xmlValue(block, 'StartTime') ?? new Date().toISOString(),
        payload: { source: 'trading', picture_urls: xmlValues(block, 'PictureURL').slice(0, 12) },
      });
      imported++;
    }
    const totalPages = Number(xmlValue(xml, 'TotalNumberOfPages') ?? 1);
    if (page >= totalPages) break;
  }
  return { imported, skipped };
}

serve(async req => {
  const admin = adminClient();
  if (isServiceCall(req)) {
    const { data: accounts } = await admin
      .from('marketplace_accounts')
      .select('user_id')
      .eq('marketplace', 'ebay')
      .eq('status', 'connected');
    const results: Array<Record<string, unknown>> = [];
    for (const a of accounts ?? []) {
      try {
        results.push({ user: a.user_id, ...(await syncSeller(admin, a.user_id)) });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await admin
          .from('marketplace_accounts')
          .update({ last_error: message, ...(err instanceof EbayNotConnected ? { status: 'expired' } : {}) })
          .eq('user_id', a.user_id)
          .eq('marketplace', 'ebay');
        results.push({ user: a.user_id, error: message });
      }
    }
    return json(req, { synced: results.length, results });
  }

  const { user } = await requireUser(req);
  const body = req.method === 'POST' ? await readJson<{ action?: string }>(req).catch(() => ({ action: 'sync' })) : { action: 'sync' };
  if (body.action === 'import') return json(req, await importListings(admin, user.id));
  return json(req, await syncSeller(admin, user.id));
});
