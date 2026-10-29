// Finding sales on marketplaces without a seller API, and importing an
// existing Vinted wardrobe.

import { makeSku, MARKETPLACES, type Listing, type MarketplaceId } from '@pilego/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { between, errorText, sleep, uuid } from '../shared/browser.ts';
import type { VintedOutcome } from '../shared/messages.ts';
import { readBlock } from '../shared/pace.ts';
import { pagePrice, pageState } from '../shared/sold.ts';
import { catalogKey, flattenCatalogs, isSold, listedAt, photoUrls, priceOf, toPileItem, type CatalogNode, type EditableItem, type WardrobeItem } from '../vinted/map.ts';
import { closeOpenedTabs, loadProfile, vintedTab } from './jobs.ts';
import { sendToTab } from './tabs.ts';

export interface SyncResult {
  checked: number;
  sales: number;
  notes: string[];
}

const LIVE = ['listed', 'needs_action', 'publishing', 'delisting'];

async function recordSale(sb: SupabaseClient, listing: Listing, price: number | null, source: string): Promise<boolean> {
  const { error } = await sb.rpc('record_sale', {
    p_listing_id: listing.id,
    p_price: price,
    p_sold_at: new Date().toISOString(),
    p_data: { source },
  });
  if (error) console.warn('[pileGo] record_sale failed', error.message);
  return !error;
}

async function wardrobe(tabId: number): Promise<{ items: WardrobeItem[]; complete: boolean; member: string; site: string } | null> {
  const out = await sendToTab<VintedOutcome>(tabId, { type: 'vinted:wardrobe' }, 60_000);
  if (out.status !== 'done') throw new Error(out.status === 'failed' ? out.message : 'Could not read the Vinted wardrobe.');
  return out.data as { items: WardrobeItem[]; complete: boolean; member: string; site: string };
}

async function syncVinted(sb: SupabaseClient, interactive: boolean, result: SyncResult) {
  if (await readBlock('vinted')) return;
  const profile = await loadProfile(sb);
  const tabId = await vintedTab(interactive, profile?.region);
  if (tabId == null) return;
  const w = await wardrobe(tabId);
  if (!w) return;

  const { data } = await sb.from('listings').select('*').eq('marketplace', 'vinted').in('status', LIVE);
  const listings = (data ?? []) as Listing[];
  const byExternal = new Map(listings.filter(l => l.external_id).map(l => [l.external_id!, l]));
  const seen = new Set<string>();

  for (const v of w.items) {
    const id = String(v.id);
    seen.add(id);
    const listing = byExternal.get(id);
    if (listing && isSold(v) && (await recordSale(sb, listing, priceOf(v), 'vinted_wardrobe'))) result.sales += 1;
  }

  // Drafts the seller finished on Vinted: match them back by title.
  for (const l of listings.filter(l => !l.external_id && (l.payload as { draft_id?: string }).draft_id)) {
    const hit = w.items.find(v => !v.is_draft && !v.is_closed && v.title?.trim() === l.title?.trim() && !byExternal.has(String(v.id)));
    if (hit) {
      await sb
        .from('listings')
        .update({ status: 'listed', external_id: String(hit.id), external_url: hit.url ?? `${w.site}/items/${hit.id}`, error: null })
        .eq('id', l.id);
    }
  }

  // Gone from the wardrobe without a sale: removed on Vinted.
  if (w.complete) {
    for (const l of listings) {
      if (l.status === 'listed' && l.external_id && !seen.has(l.external_id)) {
        await sb.from('listings').update({ status: 'delisted', error: 'No longer on Vinted.' }).eq('id', l.id);
        result.notes.push(`${l.title ?? 'A listing'} is no longer on Vinted.`);
      }
    }
  }

  await sb
    .from('marketplace_accounts')
    .upsert(
      { marketplace: 'vinted', status: 'connected', username: w.member, meta: { site: w.site }, last_sync_at: new Date().toISOString(), last_error: null },
      { onConflict: 'user_id,marketplace' },
    );
  result.checked += w.items.length;
}

/** Depop, Poshmark, Mercari and Grailed: read each live listing's public page. */
async function syncPages(sb: SupabaseClient, result: SyncResult) {
  const markets = (Object.keys(MARKETPLACES) as MarketplaceId[]).filter(
    m => m !== 'vinted' && MARKETPLACES[m].capabilities.sold_sync === 'extension',
  );
  const { data } = await sb
    .from('listings')
    .select('*')
    .in('marketplace', markets)
    .eq('status', 'listed')
    .not('external_url', 'is', null)
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(40);
  for (const l of (data ?? []) as Listing[]) {
    try {
      const r = await fetch(l.external_url!, { credentials: 'omit', redirect: 'follow' });
      const html = r.ok ? await r.text() : '';
      const verdict = pageState(l.marketplace, r.status, html);
      if (verdict === 'sold') {
        if (await recordSale(sb, l, pagePrice(html) ?? l.price, `${l.marketplace}_page`)) result.sales += 1;
      } else {
        const patch: Partial<Listing> = { last_synced_at: new Date().toISOString() };
        if (verdict === 'gone') Object.assign(patch, { status: 'needs_action', error: `Not found on ${MARKETPLACES[l.marketplace].name}. If it sold there, mark it sold.` });
        await sb.from('listings').update(patch).eq('id', l.id);
      }
      result.checked += 1;
    } catch (err) {
      result.notes.push(`${MARKETPLACES[l.marketplace].name}: ${errorText(err)}`);
    }
    await sleep(between(1500, 3000));
  }
}

export async function syncSales(sb: SupabaseClient, interactive: boolean): Promise<SyncResult> {
  const result: SyncResult = { checked: 0, sales: 0, notes: [] };
  try {
    await syncVinted(sb, interactive, result);
  } catch (err) {
    result.notes.push(`Vinted: ${errorText(err)}`);
  } finally {
    await closeOpenedTabs();
  }
  await syncPages(sb, result);
  return result;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

async function storePhotos(sb: SupabaseClient, uid: string, itemId: string, urls: string[]) {
  const rows = [];
  for (const [position, url] of urls.slice(0, 12).entries()) {
    try {
      const r = await fetch(url, { credentials: 'omit' });
      if (!r.ok) continue;
      const blob = await r.blob();
      const type = /png|webp|jpeg/.test(blob.type) ? blob.type : 'image/jpeg';
      const id = uuid();
      const path = `${uid}/${itemId}/${id}.${type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'}`;
      const { error } = await sb.storage.from('photos').upload(path, blob, { contentType: type, upsert: false });
      if (error) continue;
      rows.push({ id, item_id: itemId, path, position });
    } catch {
      // A photo that will not download is skipped; the item still imports.
    }
  }
  if (rows.length) await sb.from('item_photos').insert(rows);
  return rows.length;
}

export async function importVinted(sb: SupabaseClient, uid: string, limit = 60): Promise<{ imported: number; skipped: number }> {
  const profile = await loadProfile(sb);
  const tabId = await vintedTab(true, profile?.region);
  if (tabId == null) throw new Error('Open Vinted in a tab first.');
  try {
    const w = await wardrobe(tabId);
    if (!w) return { imported: 0, skipped: 0 };
    const { data } = await sb.from('listings').select('external_id').eq('marketplace', 'vinted').not('external_id', 'is', null);
    const have = new Set(((data ?? []) as Array<{ external_id: string }>).map(r => r.external_id));
    const fresh = w.items.filter(v => !v.is_closed && !v.is_draft && !v.is_hidden && !have.has(String(v.id)));
    let imported = 0;
    let leaves: ReturnType<typeof flattenCatalogs> | null = null;

    for (const v of fresh.slice(0, limit)) {
      const out = await sendToTab<VintedOutcome>(tabId, { type: 'vinted:item', external_id: String(v.id) }, 30_000);
      if (out.status !== 'done') continue;
      const { item, catalogs } = out.data as { item: EditableItem | null; catalogs: CatalogNode[] | null };
      if (!item) continue;
      leaves ??= catalogs ? flattenCatalogs(catalogs) : [];
      const path = leaves.find(l => l.id === item.catalog_id)?.path ?? [];
      const pile = toPileItem({ ...v, ...item, brand_title: v.brand_title ?? item.brand_title, size_title: v.size_title ?? item.size_title }, path);

      const itemId = uuid();
      const { error } = await sb.from('items').insert({
        id: itemId,
        sku: makeSku(pile.category),
        status: 'listed',
        title: pile.title,
        description: pile.description,
        brand: pile.brand,
        size: pile.size,
        department: pile.department,
        category: pile.category,
        subcategory: pile.subcategory,
        condition: pile.condition,
        colors: pile.colors,
        price: pile.price,
        currency: pile.currency ?? profile?.currency ?? 'GBP',
        notes: 'Imported from Vinted',
      });
      if (error) continue;
      await storePhotos(sb, uid, itemId, photoUrls(item).length ? photoUrls(item) : photoUrls(v));
      await sb.from('listings').insert({
        item_id: itemId,
        marketplace: 'vinted',
        status: 'listed',
        external_id: String(v.id),
        external_url: v.url ?? `${w.site}/items/${v.id}`,
        title: pile.title,
        price: pile.price,
        listed_at: listedAt(v) ?? new Date().toISOString(),
        payload: { imported: true, site: w.site },
      });
      const learned = [];
      if (item.catalog_id && pile.category) learned.push({ marketplace: 'vinted', kind: 'catalog', key: catalogKey(pile), value: item.catalog_id });
      if (item.brand_id && pile.brand) learned.push({ marketplace: 'vinted', kind: 'brand', key: pile.brand.toLowerCase(), value: item.brand_id });
      if (learned.length) await sb.from('marketplace_mappings').upsert(learned, { onConflict: 'user_id,marketplace,kind,key' });
      imported += 1;
      await sleep(between(900, 2400));
    }
    return { imported, skipped: w.items.length - imported };
  } finally {
    await closeOpenedTabs();
  }
}
