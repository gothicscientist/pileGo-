// Reading comparable sales from marketplace pages. Poshmark serves its search
// results as JSON in the page (window.__INITIAL_STATE__), sold listings
// included, with each one's price, condition, size, and when it was listed
// and sold. The server and the extension both read it with this code.

import type { Condition, PriceComp } from './types.ts';

export type CompRegion = 'US' | 'UK' | 'EU' | 'AU' | 'CA';

const POSHMARK_HOSTS: Partial<Record<CompRegion, string>> = { US: 'poshmark.com', CA: 'poshmark.ca' };

/** Poshmark's search for sold (or live) listings, or null where Poshmark does not sell. */
export function poshmarkSearchUrl(query: string, region: unknown, opts: { sold?: boolean } = {}): string | null {
  const host = POSHMARK_HOSTS[(typeof region === 'string' ? region : 'US') as CompRegion];
  if (!host) return null;
  const params = new URLSearchParams({ query, availability: opts.sold === false ? 'available' : 'sold_out' });
  return `https://${host}/search?${params}`;
}

const POSHMARK_CONDITION: Record<string, Condition> = {
  nwt: 'new_with_tags',
  not_nwt: 'new_without_tags',
  ret: 'new_with_tags',
  uln: 'excellent',
  ug: 'good',
  uf: 'fair',
};

/** A condition from a marketplace's own words, such as eBay's "Pre-owned - Excellent". */
export function conditionFromText(text: string | null | undefined): Condition | null {
  const t = (text ?? '').toLowerCase();
  if (!t) return null;
  if (/new with(?!out)\s*tags|\bnwt\b|brand new/.test(t)) return 'new_with_tags';
  if (/new without tags|new \(other\)|new other|\bnwot\b|new with defects/.test(t)) return 'new_without_tags';
  if (/excellent|like new/.test(t)) return 'excellent';
  if (/fair|acceptable|for parts/.test(t)) return 'fair';
  if (/pre-?owned|used|good/.test(t)) return 'good';
  return null;
}

/**
 * The JSON value that starts at `start`: an object or array, found by
 * matching brackets outside strings, so the script after it does not matter.
 */
export function jsonValueAt(text: string, start: number): unknown {
  const open = text[start];
  if (open !== '{' && open !== '[') return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (inString) {
      if (ch === 92) i++; // backslash: skip the escaped character
      else if (ch === 34) inString = false;
      continue;
    }
    if (ch === 34) inString = true;
    else if (ch === 123 || ch === 91) depth++;
    else if (ch === 125 || ch === 93) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

type PoshPost = {
  id?: string;
  title?: string;
  price_amount?: { val?: string; currency_code?: string };
  condition?: string | null;
  size?: string | null;
  first_published_at?: string | null;
  inventory?: { status?: string; status_changed_at?: string | null };
};

function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/**
 * Listings from a Poshmark search page. Sold ones carry the date they sold
 * and the date they were first listed. `max` caps how many are kept.
 */
export function parsePoshmarkSearch(html: string, opts: { host?: string; max?: number } = {}): PriceComp[] {
  const marker = 'window.__INITIAL_STATE__=';
  const at = html.indexOf(marker);
  if (at < 0) return [];
  const state = jsonValueAt(html, at + marker.length) as { $_search?: { gridData?: { data?: PoshPost[] } } } | null;
  const posts = state?.$_search?.gridData?.data;
  if (!Array.isArray(posts)) return [];
  const host = opts.host ?? 'poshmark.com';
  const out: PriceComp[] = [];
  const seen = new Set<string>();
  for (const p of posts) {
    if (out.length >= (opts.max ?? 60)) break;
    const price = Number(p?.price_amount?.val);
    const currency = String(p?.price_amount?.currency_code ?? '').toUpperCase();
    const title = typeof p?.title === 'string' ? p.title.replace(/\s+/g, ' ').trim() : '';
    if (!p?.id || seen.has(p.id) || !title || !Number.isFinite(price) || price <= 0 || !/^[A-Z]{3}$/.test(currency)) continue;
    seen.add(p.id);
    const sold = p.inventory?.status === 'sold_out';
    out.push({
      source: 'poshmark',
      title: title.slice(0, 200),
      price,
      currency,
      url: `https://${host}/listing/${encodeURIComponent(p.id)}`,
      sold,
      sold_at: sold ? isoOrNull(p.inventory?.status_changed_at) : null,
      listed_at: isoOrNull(p.first_published_at),
      condition: (p.condition && POSHMARK_CONDITION[p.condition]) || null,
      size: typeof p.size === 'string' ? p.size.slice(0, 20) : null,
    });
  }
  return out;
}

/** Poshmark's page asks for a captcha now and then instead of results. */
export function poshmarkBlocked(html: string): boolean {
  return !html.includes('window.__INITIAL_STATE__=') || /"showCaptcha"\s*:\s*true/.test(html);
}
