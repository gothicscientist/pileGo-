// Sold prices from eBay's public search, for the web app's pricing. eBay's
// sold-items API is closed to most developers and its pages refuse servers,
// but the seller's own browser can read the same search anyone can open:
// ebay.com/sch/i.html?LH_Sold=1. A service worker has no DOMParser, so the
// results are read with string matching that copes with both the older
// `s-item` markup and the newer `s-card` one.

import type { PriceComp } from '@pilego/core';
import { ext, sleep } from '../shared/browser.ts';

export type Region = 'US' | 'UK' | 'EU' | 'AU' | 'CA';

const SITES: Record<Region, { host: string; currency: string }> = {
  US: { host: 'www.ebay.com', currency: 'USD' },
  UK: { host: 'www.ebay.co.uk', currency: 'GBP' },
  EU: { host: 'www.ebay.de', currency: 'EUR' },
  AU: { host: 'www.ebay.com.au', currency: 'AUD' },
  CA: { host: 'www.ebay.ca', currency: 'CAD' },
};

export const MAX_COMPS = 40;
const CACHE_MS = 6 * 60 * 60_000;
const GAP_MS = 10_000;

export function siteForRegion(region: unknown): { host: string; currency: string } {
  return SITES[(typeof region === 'string' && region in SITES ? region : 'US') as Region];
}

export function soldSearchUrl(query: string, region: unknown): string {
  const { host } = siteForRegion(region);
  const params = new URLSearchParams({ _nkw: query, LH_Sold: '1', LH_Complete: '1', _ipg: '60' });
  return `https://${host}/sch/i.html?${params}`;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

export function decodeHtml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (whole, code: string) => {
    const lower = code.toLowerCase();
    if (lower in ENTITIES) return ENTITIES[lower]!;
    if (lower.startsWith('#x')) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith('#')) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    return whole;
  });
}

/** Visible text of a fragment, without screen-reader-only and badge spans. */
function textOf(html: string): string {
  const cleaned = html
    // "Opens in a new window or tab" and similar hidden helpers.
    .replace(/<span[^>]*class="[^"]*\bclipped\b[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '')
    // The "New listing" badge in front of titles.
    .replace(/<span[^>]*class="[^"]*\bLIGHT_HIGHLIGHT\b[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '')
    .replace(/<[^>]+>/g, ' ');
  return decodeHtml(cleaned).replace(/\s+/g, ' ').trim();
}

/** The first element whose class list matches `cls`: its opening tag and the markup after it. */
function after(chunk: string, cls: RegExp, length = 600): { tag: string; html: string } | null {
  const m = new RegExp(`<[a-z]+[^>]*class="[^"]*(?:${cls.source})[^"]*"[^>]*>`, 'i').exec(chunk);
  return m ? { tag: m[0], html: chunk.slice(m.index + m[0].length, m.index + m[0].length + length) } : null;
}

function upTo(html: string, closing: string): string {
  const at = html.indexOf(closing);
  return at >= 0 ? html.slice(0, at) : html;
}

const SYMBOLS: Array<[RegExp, string]> = [
  [/^(?:US\s*\$|USD)/i, 'USD'],
  [/^(?:AU\s*\$|AUD)/i, 'AUD'],
  [/^(?:C\s*\$|CA\s*\$|CAD)/i, 'CAD'],
  [/^(?:£|GBP)/i, 'GBP'],
  [/^(?:€|EUR)/i, 'EUR'],
];

/**
 * A single price from text such as "$25.00", "US $25.00", "£12.50",
 * "EUR 25,00" or "25,00 €". Ranges ("$20.00 to $30.00") are a listing with
 * variations and say nothing about this item, so they give null.
 */
export function parsePrice(text: string, fallbackCurrency: string): { price: number; currency: string } | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t || /\d\s*(?:to|bis|-|–)\s*\D{0,4}\d/i.test(t)) return null;
  const amount = /(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/.exec(t);
  if (!amount) return null;
  let currency = fallbackCurrency;
  const before = t.slice(0, amount.index).trim();
  const afterText = t.slice(amount.index + amount[0].length).trim();
  for (const [re, code] of SYMBOLS) {
    if (re.test(before) || re.test(afterText)) {
      currency = code;
      break;
    }
  }
  if (currency === fallbackCurrency && /^\$/.test(before) && fallbackCurrency !== 'USD' && !/^(AUD|CAD)$/.test(fallbackCurrency)) {
    currency = 'USD';
  }
  const raw = amount[0].replace(/\s/g, '');
  // The last separator followed by one or two digits is the decimal point.
  const dec = /[.,](\d{1,2})$/.exec(raw);
  const whole = (dec ? raw.slice(0, -dec[0].length) : raw).replace(/[.,]/g, '');
  const price = Number(`${whole}.${dec ? dec[1] : '0'}`);
  return Number.isFinite(price) && price > 0 ? { price, currency } : null;
}

/**
 * Sold listings from an eBay search results page. Results after eBay's
 * "fewer words" divider match the search loosely, so they are left out.
 */
export function parseSoldListings(html: string, fallbackCurrency = 'USD', max = MAX_COMPS): PriceComp[] {
  let body = html;
  const divider = /<li[^>]*class="[^"]*srp-river-answer--REWRITE_START[^"]*"/i.exec(body);
  if (divider) body = body.slice(0, divider.index);

  const starts: number[] = [];
  const itemStart = /<li\b[^>]*class="(?:[^"]*\s)?s-(?:item|card)(?:\s[^"]*)?"[^>]*>/gi;
  for (let m = itemStart.exec(body); m; m = itemStart.exec(body)) starts.push(m.index);

  const out: PriceComp[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < starts.length && out.length < max; i++) {
    const chunk = body.slice(starts[i]!, starts[i + 1] ?? body.length);

    const link = /href="(https?:\/\/[a-z.]*ebay\.[a-z.]+\/itm\/(?:[^"/?]*\/)?(\d{9,15})[^"]*)"/i.exec(chunk);
    if (!link) continue;
    const id = link[2]!;
    // eBay's first card is a "Shop on eBay" placeholder pointing at item 123456.
    if (id === '123456' || seen.has(id)) continue;

    // Not s-item__title--tag, which holds the sold date in older pages.
    const titleEl = after(chunk, /\bs-(?:item|card)__title(?![\w-])/);
    const title = titleEl ? textOf(upTo(titleEl.html, '</div>')) : '';
    if (!title || /^shop on ebay$/i.test(title)) continue;

    // The price sits in a row of its own in both markups, so the row ends it.
    const priceEl = after(chunk, /\bs-item__price\b|\bs-card__price\b/, 400);
    if (!priceEl) continue;
    const priceHtml = upTo(priceEl.html, '</div>');
    // A struck-through sold price means a Best Offer was accepted for less,
    // and eBay does not say how much less. Counting it would price too high.
    if (/strikethrough/i.test(priceEl.tag + priceHtml)) continue;
    const price = parsePrice(textOf(priceHtml), fallbackCurrency);
    if (!price) continue;

    const host = new URL(link[1]!.replace(/&amp;/g, '&')).host;
    seen.add(id);
    out.push({
      source: 'ebay',
      title: title.slice(0, 200),
      price: price.price,
      currency: price.currency,
      url: `https://${host}/itm/${id}`,
      sold: true,
    });
  }
  return out;
}

/** eBay's bot check, which shows instead of results now and then. */
export function looksLikeChallenge(html: string): boolean {
  return /Pardon Our Interruption|captcha|splashui\/challenge/i.test(html) && !/s-(?:item|card)__price/.test(html);
}

// ---------------------------------------------------------------------------
// Fetching, with a cache and a gentle pace
// ---------------------------------------------------------------------------

let lastFetch = 0;
const memory = new Map<string, { at: number; comps: PriceComp[] }>();

export interface SoldCompsResult {
  comps: PriceComp[] | null;
  error?: string;
  url?: string;
}

export async function soldComps(query: string, region: unknown): Promise<SoldCompsResult> {
  const q = String(query ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (q.length < 3) return { comps: null, error: 'The search was too short.' };
  const url = soldSearchUrl(q, region);
  const key = `comps:${url}`;

  const cached = memory.get(key) ?? ((await ext.storage.local.get(key))[key] as { at: number; comps: PriceComp[] } | undefined);
  if (cached && Date.now() - cached.at < CACHE_MS) return { comps: cached.comps, url };

  const wait = lastFetch + GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastFetch = Date.now();

  let html: string;
  try {
    const res = await fetch(url, { credentials: 'include', headers: { Accept: 'text/html' } });
    html = await res.text();
    if (!res.ok && !html.includes('s-item') && !html.includes('s-card')) {
      return { comps: null, error: `eBay answered ${res.status}. Open ebay.com in a tab once, then try again.`, url };
    }
  } catch (err) {
    return { comps: null, error: `Could not reach eBay: ${err instanceof Error ? err.message : String(err)}`, url };
  }
  if (looksLikeChallenge(html)) {
    return { comps: null, error: 'eBay wants a quick check that you are human. Open ebay.com in a tab, then try again.', url };
  }

  const comps = parseSoldListings(html, siteForRegion(region).currency);
  const entry = { at: Date.now(), comps };
  memory.set(key, entry);
  await ext.storage.local.set({ [key]: entry }).catch(() => {});
  await pruneCache();
  return { comps, url };
}

/** Keep at most 50 cached searches. */
async function pruneCache() {
  const all = await ext.storage.local.get(null);
  const keys = Object.keys(all)
    .filter(k => k.startsWith('comps:'))
    .sort((a, b) => ((all[b] as { at: number }).at ?? 0) - ((all[a] as { at: number }).at ?? 0));
  if (keys.length > 50) await ext.storage.local.remove(keys.slice(50));
}
