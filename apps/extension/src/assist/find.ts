// Finding the listing pileGo just posted, when the site does not go straight
// to it. Depop lands on a "Done" screen with no link to the item, Poshmark
// sometimes on the feed. The seller's own shop always has it, newest first.
//
// Titles are not matched exactly: Depop builds its address from the first
// few words of the description, Poshmark from the whole title, and both cut
// it short. So each link is scored by how many of the listing's words it
// carries, and links pileGo already knows (older listings, often of a very
// similar piece) are skipped.

import type { MarketplaceId } from '@pilego/core';
import { norm, text } from './dom.ts';
import { postedListing } from './sites.ts';

/** Words every listing link carries, which say nothing about which one it is. */
const NOISE = new Set([
  'a', 'an', 'and', 'the', 'of', 'for', 'with', 'in', 'on', 'by', 'size',
  'products', 'product', 'listing', 'listings', 'item', 'items', 'listed', 'sold', 'manage', 'us', 'closet',
]);

/** The words that identify a listing: no ids, no bare numbers, no filler. */
export function keyWords(s: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const w of norm(s).split(' ')) {
    if (w.length < 2 || NOISE.has(w) || /^\d+$/.test(w)) continue;
    // Depop's 4-character suffix and Poshmark's 24-character id are hex with digits.
    if (/\d/.test(w) && /^[0-9a-f]{4,}$/.test(w)) continue;
    out.add(w);
  }
  return out;
}

/** How well a link's words cover the listing's: 1 is every word of the shorter one. */
export function overlap(want: Set<string>, have: Set<string>): { score: number; shared: number } {
  let shared = 0;
  for (const w of want) if (have.has(w)) shared += 1;
  const size = Math.min(want.size, have.size);
  return { score: size ? shared / size : 0, shared };
}

/** At least this share of words, and at least two of them, before a link counts. */
const MIN_SCORE = 0.6;
const MIN_SHARED = 2;

export interface ListingHit {
  url: string;
  id: string | null;
  score: number;
}

/**
 * When a listing was made, where its id says. Poshmark's ids are MongoDB
 * object ids, whose first eight hex digits are the second it was created.
 */
export function listedAt(market: MarketplaceId, id: string | null): number | null {
  if (market !== 'poshmark' || !id) return null;
  const oid = id.match(/([0-9a-f]{24})$/i)?.[1];
  return oid ? parseInt(oid.slice(0, 8), 16) * 1000 : null;
}

/** Clocks differ a little between the seller's computer and the site. */
const CLOCK_SLACK_MS = 10 * 60_000;

/**
 * Listing links on a page that look like the one just posted, best first.
 * Among equal scores, the one higher on the page (newer, on a shop page) wins.
 * With `since`, a listing whose id says it is older than that is skipped.
 */
export function rankListings(market: MarketplaceId, root: ParentNode, wants: string[], exclude: string[] = [], since?: number): ListingHit[] {
  const wanted = wants.map(keyWords).filter(w => w.size > 0);
  if (!wanted.length) return [];
  const skip = new Set<string>();
  for (const e of exclude) {
    const hit = postedListing(market, e);
    if (hit?.id) skip.add(hit.id.toLowerCase());
  }
  const best = new Map<string, ListingHit & { order: number }>();
  let order = 0;
  for (const a of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    order += 1;
    const hit = postedListing(market, a.href);
    if (!hit || (hit.id && skip.has(hit.id.toLowerCase()))) continue;
    const made = since ? listedAt(market, hit.id) : null;
    if (made != null && made < since! - CLOCK_SLACK_MS) continue;
    let path = '';
    try {
      path = new URL(a.href).pathname;
    } catch {
      continue;
    }
    // The card's text, its photo's alt text, or the slug in the address all carry the title.
    const have = keyWords(`${text(a)} ${a.title} ${a.querySelector('img')?.alt ?? ''} ${path.replace(/[-_/]+/g, ' ')}`);
    let score = 0;
    for (const want of wanted) {
      const o = overlap(want, have);
      if (o.shared >= Math.min(MIN_SHARED, want.size)) score = Math.max(score, o.score);
    }
    if (score < MIN_SCORE) continue;
    const key = hit.id ?? hit.url;
    const seen = best.get(key);
    if (!seen || score > seen.score) best.set(key, { ...hit, score, order: seen?.order ?? order });
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.order - b.order).map(({ order: _, ...hit }) => hit);
}

/** Where each site lists the seller's own items, newest first, read off the page's header. */
export function shopUrl(market: MarketplaceId, doc: Document): string | null {
  const at = (path: string) => new URL(path, doc.baseURI).href;
  switch (market) {
    case 'depop': {
      // The header's Likes link is /<username>/likes/; the shop is /<username>/.
      const likes = doc.querySelector<HTMLAnchorElement>('header a[href$="/likes/"], nav a[href$="/likes/"], a[aria-label="Likes"][href$="/likes/"]');
      const path = likes?.getAttribute('href')?.replace(/likes\/$/, '');
      return path && /^\/[^/]+\/$/.test(path) ? at(path) : null;
    }
    case 'poshmark': {
      const mine = doc.querySelector<HTMLAnchorElement>('[class*="account-menu"] a[href^="/closet/"]') ?? doc.querySelector<HTMLAnchorElement>('header a[href^="/closet/"]');
      const path = mine?.getAttribute('href')?.split(/[?#]/)[0];
      return path && /^\/closet\/[^/]+\/?$/.test(path) ? at(path) : null;
    }
    case 'mercari':
      return at('/mypage/listings/active/');
    case 'grailed':
      return at('/sell/for-sale');
    default:
      return null;
  }
}

/** Depop's "Done" screen names the new product by its number: /products/create/success/?productId=… */
export function postedProductId(market: MarketplaceId, url: string | null | undefined): string | null {
  if (market !== 'depop' || !url) return null;
  return url.match(/[?&]productId=(\d+)/)?.[1] ?? null;
}

/** Whether a Depop product page's markup is the product with this number. */
export function pageIsProduct(markup: string, productId: string): boolean {
  return new RegExp(`\\\\?"productId\\\\?"\\s*:\\s*\\\\?"?${productId}\\b`).test(markup);
}
