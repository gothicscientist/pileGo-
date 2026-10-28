// Generated from packages/core/src by scripts/sync-core.mjs. Do not edit.
// Shared shapes for the web app, the extension and the server functions.
// Database rows use snake_case, so these do too: the same object travels from
// Postgres to the browser to a marketplace payload without renaming.

export type MarketplaceId =
  | 'ebay'
  | 'vinted'
  | 'depop'
  | 'poshmark'
  | 'mercari'
  | 'grailed'
  | 'facebook'
  | 'etsy'
  | 'vestiaire';

/**
 * How pileGo reaches a marketplace.
 * - api: official API from the server, works with the browser closed.
 * - extension: the extension calls the marketplace's own web endpoints from a
 *   logged-in tab. One click, no form.
 * - assist: the extension fills the marketplace's own sell form; the seller
 *   checks it and presses the marketplace's Publish button.
 * - manual: a copy-ready listing kit and a link to the sell page.
 */
export type Tier = 'api' | 'extension' | 'assist' | 'manual';

export type Department = 'women' | 'men' | 'kids' | 'unisex';

export type Condition =
  | 'new_with_tags'
  | 'new_without_tags'
  | 'excellent'
  | 'good'
  | 'fair';

export type ItemStatus = 'draft' | 'ready' | 'listed' | 'sold' | 'shipped' | 'archived';

export type ListingStatus =
  | 'draft'
  | 'queued'
  | 'publishing'
  | 'listed'
  | 'needs_action'
  | 'failed'
  | 'delisting'
  | 'delisted'
  | 'sold';

export type JobKind = 'publish' | 'delist' | 'relist' | 'import' | 'sync' | 'update_price';
export type JobStatus = 'pending' | 'running' | 'done' | 'failed' | 'needs_user' | 'cancelled';
export type JobRunner = 'server' | 'extension';

export interface Measurements {
  unit: 'cm' | 'in';
  pit_to_pit?: number | null;
  length?: number | null;
  shoulder?: number | null;
  sleeve?: number | null;
  waist?: number | null;
  hips?: number | null;
  inseam?: number | null;
  rise?: number | null;
}

export interface Photo {
  id: string;
  item_id: string;
  path: string;
  cutout_path: string | null;
  position: number;
  width: number | null;
  height: number | null;
  /** Signed or public URL, filled in by the client when it loads the row. */
  url?: string;
  cutout_url?: string | null;
}

export interface Item {
  id: string;
  user_id: string;
  sku: string;
  status: ItemStatus;
  title: string;
  brand: string | null;
  department: Department | null;
  category: string | null;
  subcategory: string | null;
  size: string | null;
  size_system: string | null;
  colors: string[];
  materials: string[];
  condition: Condition | null;
  flaws: string | null;
  measurements: Measurements | null;
  style_tags: string[];
  era: string | null;
  description: string;
  price: number | null;
  original_price: number | null;
  cost: number | null;
  currency: string;
  location: string | null;
  notes: string | null;
  ai: ScanResult | null;
  price_suggestion: PriceSuggestion | null;
  sold_at: string | null;
  sold_price: number | null;
  sold_marketplace: MarketplaceId | null;
  created_at: string;
  updated_at: string;
  photos?: Photo[];
  listings?: Listing[];
}

export interface Listing {
  id: string;
  user_id: string;
  item_id: string;
  marketplace: MarketplaceId;
  status: ListingStatus;
  external_id: string | null;
  external_url: string | null;
  title: string | null;
  price: number | null;
  payload: Record<string, unknown>;
  error: string | null;
  listed_at: string | null;
  last_synced_at: string | null;
  relist_count: number;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  user_id: string;
  kind: JobKind;
  runner: JobRunner;
  marketplace: MarketplaceId;
  item_id: string | null;
  listing_id: string | null;
  status: JobStatus;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  attempts: number;
  run_after: string;
  created_at: string;
  updated_at: string;
}

export type EventType =
  | 'created'
  | 'listed'
  | 'price_changed'
  | 'relisted'
  | 'delisted'
  | 'sold'
  | 'shipped';

export interface ItemEvent {
  id: string;
  user_id: string;
  item_id: string | null;
  listing_id: string | null;
  marketplace: MarketplaceId | null;
  type: EventType;
  data: Record<string, unknown>;
  at: string;
}

/** What the AI scan returns, before the seller confirms it. */
export interface ScanResult {
  title: string;
  brand: string | null;
  department: Department | null;
  category: string | null;
  subcategory: string | null;
  size: string | null;
  size_system: string | null;
  colors: string[];
  materials: string[];
  condition: Condition | null;
  flaws: string | null;
  era: string | null;
  style_tags: string[];
  description: string;
  keywords: string[];
  price: { low: number; high: number; suggested: number; currency: string };
  measurements_to_take: string[];
  confidence: number;
  notes: string | null;
}

export interface PriceComp {
  source: MarketplaceId | 'own_sales';
  title: string;
  price: number;
  currency: string;
  url?: string | null;
  sold: boolean;
}

export interface PriceSuggestion {
  suggested: number;
  low: number;
  high: number;
  currency: string;
  confidence: 'low' | 'medium' | 'high';
  reasons: string[];
  comps_used: number;
  computed_at: string;
}

export interface SellerVoice {
  tone: 'friendly' | 'minimal' | 'hype' | 'vintage-nerd';
  sign_off: string | null;
  always_mention: string[];
  avoid_words: string[];
}

export interface Profile {
  id: string;
  display_name: string | null;
  currency: string;
  region: 'US' | 'UK' | 'EU' | 'AU' | 'CA';
  measurement_unit: 'cm' | 'in';
  voice: SellerVoice;
  fee_overrides: Partial<Record<MarketplaceId, { percent: number; fixed: number }>>;
  marketplaces: MarketplaceId[];
  stale_after_days: number;
  created_at: string;
  updated_at: string;
}
