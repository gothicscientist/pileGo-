// Messages between the extension's parts. The background worker owns the
// session and the job queue; content scripts only touch their own page.

import type { GeneratedListing, MarketplaceId } from '@pilego/core';

export interface PhotoBytes {
  data: string;
  type: string;
  name: string;
}

/** What a marketplace tab needs to list one item. */
export interface ListingWork {
  job_id: string;
  listing_id: string;
  marketplace: MarketplaceId;
  listing: GeneratedListing;
  item: {
    sku: string;
    brand: string | null;
    department: string | null;
    category: string | null;
    subcategory: string | null;
    size: string | null;
    colors: string[];
    condition: string | null;
    original_price: number | null;
    materials: string[];
    style_tags: string[];
    era: string | null;
  };
  photos: PhotoBytes[];
  /** Ids learned earlier for this marketplace (catalog, brand). */
  learned: Record<string, unknown>;
  /** Existing listing on the marketplace, for relist, delist and price changes. */
  external_id: string | null;
  external_url: string | null;
}

export interface ExtStatus {
  installed: true;
  version: string;
  tabs: Record<string, boolean>;
  running: number;
  linked: boolean;
  user_id: string | null;
  needs_approval: boolean;
  last_error: string | null;
  /** The outcome of the last thing the seller asked for, such as an import. */
  last_message: string | null;
}

export type VintedRequest =
  | { type: 'vinted:publish'; work: ListingWork }
  | { type: 'vinted:relist'; work: ListingWork }
  | { type: 'vinted:delist'; external_id: string }
  | { type: 'vinted:price'; external_id: string; price: number }
  | { type: 'vinted:wardrobe'; max_pages?: number }
  | { type: 'vinted:item'; external_id: string }
  | { type: 'vinted:ping' };

export type VintedOutcome =
  | { status: 'listed'; external_id: string; url: string; learned?: Record<string, unknown>; price?: number }
  | { status: 'needs_user'; message: string; url: string; draft_id?: string; learned?: Record<string, unknown> }
  | { status: 'done'; data?: unknown }
  | { status: 'failed'; message: string; retry_in?: number; blocked?: boolean };

export type AssistRequest =
  | { type: 'assist:fill'; work: ListingWork }
  | { type: 'assist:remove'; work: ListingWork; reason: string }
  | { type: 'assist:ping' };

export type AssistReport =
  | { type: 'assist:posted'; job_id: string; url: string | null }
  | { type: 'assist:removed'; job_id: string }
  | { type: 'assist:gave-up'; job_id: string; message: string }
  /** The form would not post on its own; the tab stays open for the seller. */
  | { type: 'assist:stuck'; job_id: string; message: string };

/** What a sell-form tab answers to assist:fill, once it has done all it can. */
export interface FillResult {
  ok: boolean;
  filled: string[];
  missing: string[];
  photos: number;
  /** pileGo pressed the site's own post button. */
  posted: boolean;
  error?: string;
}

/** Keeps the background worker awake and the seller informed while a form fills. */
export interface AssistProgress {
  type: 'assist:progress';
  job_id: string;
  step: string;
}
