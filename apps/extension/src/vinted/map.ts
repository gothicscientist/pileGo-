// Turning pileGo items into Vinted drafts and Vinted items back into pileGo
// items. Pure functions, so the guessing parts can be tested without Vinted.
//
// The draft shape and the size handling follow Bumpline's relister
// (GPL-3.0-or-later, by g1ampy), measured against live Vinted drafts.

import {
  CATEGORIES,
  conditionFromVintedId,
  isCondition,
  matchCategory,
  VINTED_CONDITION_ID,
  type Condition,
  type Department,
} from '@pilego/core';
import type { ListingWork } from '../shared/messages.ts';

export interface CatalogNode {
  id: number;
  title: string;
  catalogs?: CatalogNode[];
}

export interface CatalogLeaf {
  id: number;
  title: string;
  /** Titles from the root down to the leaf, the leaf included. */
  path: string[];
  root_id: number;
}

export interface SizeGroup {
  id?: number;
  caption?: string;
  sizes?: Array<{ id: number; title: string }>;
}

export interface VintedPhoto {
  id: number;
  orientation?: number;
}

export interface VintedIds {
  catalog_id: number | null;
  brand_id: number | null;
  brand: string | null;
  size_id: number | null;
  color_ids: number[];
  is_unisex: boolean;
}

/** Root catalogs that have kept their ids for years. Titles are the fallback. */
const ROOTS: Record<Exclude<Department, 'unisex'>, { id: number; words: RegExp }> = {
  women: { id: 1904, words: /^(women|femmes?|damen|donna|mujer|dames|kobiety|mulher)/i },
  men: { id: 5, words: /^(men|hommes?|herren|uomo|hombre|heren|mężczyźni|homem)/i },
  kids: { id: 1193, words: /^(kids|enfants?|kinder|bambini|niños|kinderen|dzieci|criança)/i },
};

export function flattenCatalogs(tree: CatalogNode[]): CatalogLeaf[] {
  const leaves: CatalogLeaf[] = [];
  const walk = (node: CatalogNode, path: string[], rootId: number) => {
    const here = [...path, node.title];
    if (!node.catalogs?.length) leaves.push({ id: node.id, title: node.title, path: here, root_id: rootId });
    else for (const child of node.catalogs) walk(child, here, rootId);
  };
  for (const root of tree) walk(root, [], root.id);
  return leaves;
}

function rootFor(department: string | null, tree: CatalogNode[]): CatalogNode | undefined {
  const dep = department === 'unisex' || !department ? 'men' : (department as keyof typeof ROOTS);
  const want = ROOTS[dep] ?? ROOTS.women;
  return tree.find(n => n.id === want.id) ?? tree.find(n => want.words.test(n.title.trim()));
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const singular = (s: string) => s.replace(/(?:es|s)\b/g, '').trim();

export function catalogKey(item: { department: string | null; category: string | null; subcategory: string | null }): string {
  return `${item.department ?? 'any'}/${item.category ?? 'other'}/${item.subcategory ?? 'other'}`;
}

/**
 * The Vinted catalog for an item. Returns null rather than a poor guess: a
 * listing in the wrong catalog is worse than asking the seller to pick one.
 */
export function matchCatalog(
  tree: CatalogNode[],
  item: { department: string | null; category: string | null; subcategory: string | null; title?: string; style_tags?: string[]; materials?: string[] },
): { id: number; path: string[]; score: number } | null {
  const root = rootFor(item.department, tree);
  if (!root) return null;
  const roots = [root];
  // Some domains (vinted.com) keep accessories under their own root.
  if (item.category === 'accessories') roots.push(...tree.filter(n => /accessor/i.test(n.title) && n !== root));
  const leaves = flattenCatalogs(roots);
  // Words from the item itself break ties between equally good leaves:
  // a "denim" jacket goes to Denim jackets rather than the first jacket leaf.
  const own = new Set(norm([item.title ?? '', ...(item.style_tags ?? []), ...(item.materials ?? [])].join(' ')).split(' ').filter(w => w.length > 3).map(singular));
  const cat = CATEGORIES.find(c => c.id === item.category);
  const sub = cat?.subcategories.find(s => s.id === item.subcategory);
  const words = [...new Set([...(sub ? [sub.label, ...sub.search] : []), ...(cat && !sub ? [cat.label] : [])].map(norm))];
  if (!words.length) return null;
  const catWords = cat ? norm(cat.label).split(' ').filter(w => w.length > 3) : [];

  let best: { id: number; path: string[]; score: number } | null = null;
  for (const leaf of leaves) {
    const title = norm(leaf.title);
    const parents = norm(leaf.path.slice(1, -1).join(' '));
    let score = 0;
    for (const w of words) {
      if (title === w || singular(title) === singular(w)) score = Math.max(score, 10);
      else if (` ${title} `.includes(` ${w} `) || ` ${singular(title)} `.includes(` ${singular(w)} `)) score = Math.max(score, 6);
      else if (` ${parents} `.includes(` ${w} `)) score = Math.max(score, 3);
    }
    if (score && catWords.some(w => parents.includes(singular(w)))) score += 2;
    if (score) for (const w of title.split(' ')) if (w.length > 3 && own.has(singular(w)) && !words.some(x => singular(x) === singular(w))) score += 1;
    // "Other …" leaves only win when nothing better exists.
    if (/^other\b|^autres?\b|^sonstige/.test(title)) score -= 1;
    if (score > (best?.score ?? 0)) best = { id: leaf.id, path: leaf.path, score };
  }
  return best && best.score >= 6 ? best : null;
}

const sizeTokens = (s: string) =>
  s
    .toUpperCase()
    .replace(/\b(UK|US|EU|FR|IT|DE|INT)\s+(?=\d)/g, '$1')
    .split(/[\s/|,()]+/)
    .filter(Boolean);

/** Size id from the catalog's size groups, matched on the label tokens. */
export function matchSize(groups: SizeGroup[], size: string | null): number | null {
  if (!size) return null;
  const want = norm(size);
  if (!want) return null;
  const all = groups.flatMap(g => g.sizes ?? []);
  const exact = all.find(s => norm(s.title) === want);
  if (exact) return exact.id;
  if (/^(one size|os|onesize|n a)$/.test(want)) return all.find(s => /one size|taille unique|einheitsgr/i.test(s.title))?.id ?? null;
  const tokens = sizeTokens(size);
  // Bare numbers also match their system-prefixed form: "10" finds "UK10".
  const variants = (t: string) => {
    const bare = t.match(/^(?:UK|US|EU|FR|IT|DE|INT)(\d+(?:\.\d+)?)$/)?.[1];
    if (bare) return [t, bare];
    return /^\d+(\.\d+)?$/.test(t) ? [t, `UK${t}`, `US${t}`, `EU${t}`, `FR${t}`] : [t];
  };
  let best: { id: number; score: number; extra: number } | null = null;
  for (const s of all) {
    const have = new Set(sizeTokens(s.title));
    const hits = tokens.filter(t => variants(t).some(v => have.has(v))).length;
    if (!hits || hits < tokens.length) continue;
    const extra = have.size - hits;
    if (!best || hits > best.score || (hits === best.score && extra < best.extra)) best = { id: s.id, score: hits, extra };
  }
  return best?.id ?? null;
}

/** Vinted's basic colour ids, used when the colour list cannot be read. */
export const BASIC_COLOURS: Record<string, number> = {
  black: 1,
  brown: 2,
  grey: 3,
  gray: 3,
  beige: 4,
  pink: 5,
  purple: 6,
  red: 7,
  yellow: 8,
  blue: 9,
  green: 10,
  orange: 11,
  white: 12,
  silver: 13,
  gold: 14,
  multi: 15,
  multicolour: 15,
  multicolor: 15,
};

/** Up to two colour ids, which is all Vinted takes. */
export function matchColours(names: string[], list: Array<{ id: number; title: string }> | null): number[] {
  const ids: number[] = [];
  for (const raw of names) {
    const name = norm(raw);
    if (!name) continue;
    const fromList = list?.find(c => norm(c.title) === name) ?? list?.find(c => name.includes(norm(c.title)));
    const id = fromList?.id ?? BASIC_COLOURS[name] ?? BASIC_COLOURS[name.split(' ').pop() ?? ''];
    if (id && !ids.includes(id)) ids.push(id);
    if (ids.length === 2) break;
  }
  return ids;
}

export function matchBrand(results: Array<{ id: number; title: string }>, name: string | null): { id: number; title: string } | null {
  if (!name) return null;
  const want = norm(name);
  return results.find(b => norm(b.title) === want) ?? null;
}

/** Small parcels for most clothes, medium for coats, shoes and bags. */
export function packageSizeFor(category: string | null): number {
  return category === 'outerwear' || category === 'shoes' || category === 'bags' ? 2 : 1;
}

export function conditionId(condition: string | null): number {
  return VINTED_CONDITION_ID[isCondition(condition) ? condition : 'good'];
}

export function buildDraft(work: ListingWork, ids: VintedIds, sessionId: string, photos: VintedPhoto[]) {
  const status_id = conditionId(work.item.condition);
  const attributes: Array<{ code: string; ids: number[] }> = [{ code: 'condition', ids: [status_id] }];
  // Vinted reads the size from item_attributes and still writes size_id;
  // a completion with only one of the two is refused.
  if (ids.size_id != null) attributes.unshift({ code: 'size', ids: [ids.size_id] });
  return {
    id: null,
    temp_uuid: sessionId,
    title: work.listing.title.slice(0, 100),
    description: work.listing.description.slice(0, 2000),
    price: work.listing.price ?? 0,
    currency: work.listing.currency,
    brand_id: ids.brand_id,
    brand: ids.brand,
    size_id: ids.size_id,
    catalog_id: ids.catalog_id,
    status_id,
    is_unisex: ids.is_unisex,
    color_ids: ids.color_ids,
    item_attributes: attributes,
    assigned_photos: photos.map(p => ({ id: p.id, orientation: p.orientation ?? 0 })),
    package_size_id: packageSizeFor(work.item.category),
    shipment_prices: { domestic: null, international: null },
  };
}

/** The draft as completion wants it: `photos`, not `assigned_photos`, and the draft's id. */
export function forCompletion(draft: ReturnType<typeof buildDraft>, draftId: number | string) {
  const { assigned_photos, ...rest } = draft;
  return { ...rest, id: draftId, photos: assigned_photos.map(p => ({ id: p.id, orientation: p.orientation })) };
}

// ---------------------------------------------------------------------------
// Reading Vinted back
// ---------------------------------------------------------------------------

export interface WardrobeItem {
  id: number;
  title?: string;
  price?: { amount?: string; currency_code?: string } | string | number;
  currency?: string;
  is_closed?: boolean;
  is_draft?: boolean;
  is_hidden?: boolean;
  is_reserved?: boolean;
  item_closing_action?: string | null;
  url?: string;
  path?: string;
  brand_title?: string;
  size_title?: string;
  photos?: Array<{ full_size_url?: string; url?: string; high_resolution?: { timestamp?: number | string } }>;
}

export function priceOf(item: { price?: WardrobeItem['price']; price_numeric?: number | string }): number | null {
  if (item.price_numeric != null) return Number(item.price_numeric) || null;
  const p = item.price;
  if (p == null) return null;
  if (typeof p === 'number') return p;
  if (typeof p === 'string') return Number(p.replace(',', '.')) || null;
  return p.amount != null ? Number(p.amount) || null : null;
}

export function currencyOf(item: { price?: WardrobeItem['price']; currency?: string; price_currency?: string }): string | null {
  if (item.price_currency) return item.price_currency;
  if (item.price && typeof item.price === 'object' && item.price.currency_code) return item.price.currency_code;
  return item.currency ?? null;
}

/** Closed with no closing action, or closed as sold. Closed as anything else (hidden, deleted) is not a sale. */
export function isSold(item: WardrobeItem): boolean {
  if (!item.is_closed) return false;
  return !item.item_closing_action || /sold/i.test(item.item_closing_action);
}

/** When the item first went online: Vinted keeps no date, but its oldest photo has one. */
export function listedAt(item: WardrobeItem): string | null {
  let oldest: number | null = null;
  for (const photo of item.photos ?? []) {
    const raw = photo.high_resolution?.timestamp;
    const seconds = typeof raw === 'number' ? raw : raw ? parseInt(raw, 10) : NaN;
    if (Number.isFinite(seconds)) oldest = oldest == null ? seconds : Math.min(oldest, seconds);
  }
  return oldest == null ? null : new Date(oldest * 1000).toISOString();
}

export function photoUrls(item: { photos?: WardrobeItem['photos'] }): string[] {
  return (item.photos ?? []).map(p => p.full_size_url || p.url).filter((u): u is string => Boolean(u));
}

export interface EditableItem extends WardrobeItem {
  description?: string;
  brand_id?: number | null;
  brand?: string | null;
  size_id?: number | null;
  catalog_id?: number | null;
  status_id?: number | null;
  color_ids?: number[];
  color1?: string | null;
  color2?: string | null;
  is_unisex?: boolean;
}

/** A pileGo item from a Vinted listing, for import. */
export function toPileItem(v: EditableItem, catalogPath: string[]) {
  const root = catalogPath[0] ?? '';
  const department: Department | null = v.is_unisex
    ? 'unisex'
    : ROOTS.women.words.test(root)
      ? 'women'
      : ROOTS.men.words.test(root)
        ? 'men'
        : ROOTS.kids.words.test(root)
          ? 'kids'
          : null;
  const guess = matchCategory(`${catalogPath.slice(1).reverse().join(' ')} ${v.title ?? ''}`);
  const condition: Condition | null = conditionFromVintedId(v.status_id ?? null);
  return {
    title: (v.title ?? '').trim() || 'Untitled',
    description: (v.description ?? '').trim(),
    brand: v.brand_title || v.brand || null,
    size: v.size_title || null,
    department,
    category: guess?.category ?? null,
    subcategory: guess?.subcategory ?? null,
    condition,
    colors: [v.color1, v.color2].filter((c): c is string => Boolean(c)),
    price: priceOf(v),
    currency: currencyOf(v),
  };
}

/**
 * The logged-in member's id as the page itself was drawn with it. Vinted
 * renders the session into the markup (initialSessionData, initialUserState),
 * so this needs no request and cannot be refused by the bot shield.
 * undefined: the page does not say either way. null: the page was drawn logged out.
 */
export function userFromMarkup(markup: string): string | null | undefined {
  const q = '\\\\?"';
  const session = markup.match(new RegExp(`initialSessionData${q}:\\{${q}userId${q}:${q}?(\\d+|null)`));
  const state = markup.match(new RegExp(`initialUserState${q}:\\{${q}user${q}:(?:\\{${q}id${q}:(\\d+)|null)`));
  const id = (session?.[1] && session[1] !== 'null' ? session[1] : null) ?? state?.[1] ?? null;
  if (id) return id;
  return session || state ? null : undefined;
}
