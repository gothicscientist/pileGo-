// Whether a public listing page says the item has sold. Marketplaces without
// a seller API still describe their listings for search engines, and that
// markup is steadier than their page layout.

import type { MarketplaceId } from '@pilego/core';

export type PageState = 'sold' | 'live' | 'gone' | 'unknown';

const SCHEMA_SOLD = /"availability"\s*:\s*"(?:https?:\/\/schema\.org\/)?(?:SoldOut|OutOfStock|Discontinued)"/i;
const SCHEMA_LIVE = /"availability"\s*:\s*"(?:https?:\/\/schema\.org\/)?(?:InStock|LimitedAvailability|OnlineOnly)"/i;

const SITE_SOLD: Partial<Record<MarketplaceId, RegExp[]>> = {
  depop: [/"status"\s*:\s*"SOLD"/, /"isSold"\s*:\s*true/, /"sold"\s*:\s*true/],
  poshmark: [/"inventory_status"\s*:\s*"sold_out"/i, /"status"\s*:\s*"sold_out"/i, /class="[^"]*\bsold-tag\b/],
  mercari: [/"status"\s*:\s*"(?:sold_out|trading|ITEM_STATUS_SOLD_OUT|ITEM_STATUS_TRADING)"/i, /"itemStatus"\s*:\s*"sold"/i],
  grailed: [/"sold"\s*:\s*true/, /"sold_at"\s*:\s*"\d{4}-/],
};

export function pageState(market: MarketplaceId, status: number, html: string): PageState {
  if (status === 404 || status === 410) return 'gone';
  if (status < 200 || status >= 300) return 'unknown';
  if (SCHEMA_SOLD.test(html) || SITE_SOLD[market]?.some(re => re.test(html))) return 'sold';
  if (SCHEMA_LIVE.test(html)) return 'live';
  return 'unknown';
}

/** A sale price, when the page states one. */
export function pagePrice(html: string): number | null {
  const hit = html.match(/"price"\s*:\s*"?(\d+(?:[.,]\d{1,2})?)"?/);
  return hit ? Number(hit[1]!.replace(',', '.')) : null;
}
