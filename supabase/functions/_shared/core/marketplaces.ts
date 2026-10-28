// Generated from packages/core/src by scripts/sync-core.mjs. Do not edit.
import type { MarketplaceId, Tier } from './types.ts';

export interface FeeRule {
  /** Percentage of the sale price, 0 to 100. */
  percent: number;
  /** Flat amount per sale, in the listing currency. */
  fixed: number;
  /** Flat fee that replaces the percentage below this price. */
  flat_under?: { price: number; fee: number };
  /** Minimum fee per sale. */
  min?: number;
}

export interface MarketplaceCapabilities {
  create: Tier;
  delist: Tier;
  relist: Tier | null;
  sold_sync: Tier;
  import: Tier | null;
}

export interface MarketplaceInfo {
  id: MarketplaceId;
  name: string;
  /** Short line the app shows next to the marketplace. */
  blurb: string;
  regions: Array<'US' | 'UK' | 'EU' | 'AU' | 'CA'>;
  capabilities: MarketplaceCapabilities;
  sell_url: string;
  title_max: number;
  description_max: number;
  photos_max: number;
  hashtags_max: number;
  /** Fee estimates as of late 2026. Sellers can override them in Settings. */
  fees: Partial<Record<'US' | 'UK' | 'EU' | 'AU' | 'CA', FeeRule>>;
  /** Sticker colour for the marketplace in the UI. */
  color: string;
  /** Host patterns the extension needs for this marketplace. */
  hosts: string[];
}

export const MARKETPLACES: Record<MarketplaceId, MarketplaceInfo> = {
  ebay: {
    id: 'ebay',
    name: 'eBay',
    blurb: 'Listed, ended and synced through eBay’s official API, even with your browser closed.',
    regions: ['US', 'UK', 'EU', 'AU', 'CA'],
    capabilities: { create: 'api', delist: 'api', relist: 'api', sold_sync: 'api', import: 'api' },
    sell_url: 'https://www.ebay.com/sl/sell',
    title_max: 80,
    description_max: 4000,
    photos_max: 24,
    hashtags_max: 0,
    fees: {
      US: { percent: 13.6, fixed: 0.4, flat_under: undefined },
      UK: { percent: 0, fixed: 0 },
      EU: { percent: 0, fixed: 0 },
      AU: { percent: 13.4, fixed: 0.3 },
      CA: { percent: 13.6, fixed: 0.4 },
    },
    color: '#3B6FE0',
    hosts: ['https://*.ebay.com/*', 'https://*.ebay.co.uk/*', 'https://*.ebay.de/*'],
  },
  vinted: {
    id: 'vinted',
    name: 'Vinted',
    blurb: 'One click from your logged-in Vinted tab, using the same engine as the Bumpline relister.',
    regions: ['UK', 'EU', 'US'],
    capabilities: {
      create: 'extension',
      delist: 'extension',
      relist: 'extension',
      sold_sync: 'extension',
      import: 'extension',
    },
    sell_url: 'https://www.vinted.co.uk/items/new',
    title_max: 100,
    description_max: 2000,
    photos_max: 20,
    hashtags_max: 0,
    fees: { UK: { percent: 0, fixed: 0 }, EU: { percent: 0, fixed: 0 }, US: { percent: 0, fixed: 0 } },
    color: '#0B8A8F',
    hosts: ['https://*.vinted.co.uk/*', 'https://*.vinted.com/*', 'https://*.vinted.fr/*'],
  },
  depop: {
    id: 'depop',
    name: 'Depop',
    blurb: 'The extension fills Depop’s sell form in your tab; you check it and post.',
    regions: ['US', 'UK', 'EU', 'AU'],
    capabilities: {
      create: 'assist',
      delist: 'assist',
      relist: 'assist',
      sold_sync: 'extension',
      import: 'extension',
    },
    sell_url: 'https://www.depop.com/products/create/',
    title_max: 0,
    description_max: 1000,
    photos_max: 8,
    hashtags_max: 5,
    fees: {
      US: { percent: 3.3, fixed: 0.45 },
      UK: { percent: 0, fixed: 0 },
      EU: { percent: 0, fixed: 0 },
      AU: { percent: 2.6, fixed: 0.3 },
    },
    color: '#E5322D',
    hosts: ['https://*.depop.com/*'],
  },
  poshmark: {
    id: 'poshmark',
    name: 'Poshmark',
    blurb: 'The extension fills Poshmark’s listing form in your tab; you check it and list.',
    regions: ['US', 'CA', 'AU'],
    capabilities: {
      create: 'assist',
      delist: 'assist',
      relist: null,
      sold_sync: 'extension',
      import: 'extension',
    },
    sell_url: 'https://poshmark.com/create-listing',
    title_max: 80,
    description_max: 1500,
    photos_max: 16,
    hashtags_max: 0,
    fees: {
      US: { percent: 20, fixed: 0, flat_under: { price: 15, fee: 2.95 } },
      CA: { percent: 20, fixed: 0, flat_under: { price: 20, fee: 3.95 } },
      AU: { percent: 20, fixed: 0, flat_under: { price: 20, fee: 3.95 } },
    },
    color: '#7F0353',
    hosts: ['https://poshmark.com/*', 'https://poshmark.ca/*'],
  },
  mercari: {
    id: 'mercari',
    name: 'Mercari',
    blurb: 'The extension fills Mercari’s sell form in your tab; you check it and list.',
    regions: ['US'],
    capabilities: {
      create: 'assist',
      delist: 'assist',
      relist: null,
      sold_sync: 'extension',
      import: null,
    },
    sell_url: 'https://www.mercari.com/sell/',
    title_max: 80,
    description_max: 1000,
    photos_max: 12,
    hashtags_max: 0,
    fees: { US: { percent: 12.9, fixed: 0.5 } },
    color: '#4A5AE8',
    hosts: ['https://www.mercari.com/*'],
  },
  grailed: {
    id: 'grailed',
    name: 'Grailed',
    blurb: 'The extension fills Grailed’s sell form in your tab; you check it and publish.',
    regions: ['US', 'UK', 'EU', 'CA', 'AU'],
    capabilities: {
      create: 'assist',
      delist: 'assist',
      relist: null,
      sold_sync: 'extension',
      import: null,
    },
    sell_url: 'https://www.grailed.com/sell/new',
    title_max: 60,
    description_max: 1500,
    photos_max: 20,
    hashtags_max: 0,
    fees: { US: { percent: 12.49, fixed: 0.49 }, UK: { percent: 12.49, fixed: 0.39 } },
    color: '#111111',
    hosts: ['https://www.grailed.com/*'],
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook Marketplace',
    blurb: 'The extension fills the Marketplace form in your tab; you check it and publish.',
    regions: ['US', 'UK', 'EU', 'CA', 'AU'],
    capabilities: {
      create: 'assist',
      delist: 'manual',
      relist: null,
      sold_sync: 'manual',
      import: null,
    },
    sell_url: 'https://www.facebook.com/marketplace/create/item',
    title_max: 99,
    description_max: 1500,
    photos_max: 10,
    hashtags_max: 0,
    fees: { US: { percent: 10, fixed: 0, min: 0.8 }, UK: { percent: 0, fixed: 0 } },
    color: '#1877F2',
    hosts: ['https://www.facebook.com/*'],
  },
  etsy: {
    id: 'etsy',
    name: 'Etsy',
    blurb: 'Vintage only (20 years or older). Listing kit today; API connection is planned.',
    regions: ['US', 'UK', 'EU', 'CA', 'AU'],
    capabilities: { create: 'manual', delist: 'manual', relist: null, sold_sync: 'manual', import: null },
    sell_url: 'https://www.etsy.com/your/shops/me/listing-editor/create',
    title_max: 140,
    description_max: 5000,
    photos_max: 20,
    hashtags_max: 13,
    fees: { US: { percent: 9.5, fixed: 0.45 }, UK: { percent: 10.5, fixed: 0.4 } },
    color: '#F1641E',
    hosts: [],
  },
  vestiaire: {
    id: 'vestiaire',
    name: 'Vestiaire Collective',
    blurb: 'Designer pieces. Listing kit with a link to Vestiaire’s submission form.',
    regions: ['US', 'UK', 'EU'],
    capabilities: { create: 'manual', delist: 'manual', relist: null, sold_sync: 'manual', import: null },
    sell_url: 'https://www.vestiairecollective.com/sell-clothes-online/',
    title_max: 80,
    description_max: 1500,
    photos_max: 10,
    hashtags_max: 0,
    fees: { US: { percent: 15, fixed: 0 }, UK: { percent: 15, fixed: 0 }, EU: { percent: 15, fixed: 0 } },
    color: '#8C6A3C',
    hosts: [],
  },
};

export const MARKETPLACE_IDS = Object.keys(MARKETPLACES) as MarketplaceId[];

export const TIER_LABEL: Record<Tier, string> = {
  api: 'Automatic',
  extension: 'One click',
  assist: 'Assisted',
  manual: 'Listing kit',
};

export const TIER_EXPLAINER: Record<Tier, string> = {
  api: 'pileGo does it through the marketplace’s official API. Your browser can be closed.',
  extension: 'The pileGo extension does it in your logged-in tab. Keep a tab open while it runs.',
  assist: 'The extension fills in the marketplace’s own form. You check it and press publish there.',
  manual: 'Copy the text, download the photos, and paste them into the marketplace yourself.',
};

export function marketplace(id: MarketplaceId): MarketplaceInfo {
  return MARKETPLACES[id];
}

export function isMarketplaceId(value: unknown): value is MarketplaceId {
  return typeof value === 'string' && value in MARKETPLACES;
}
