// Sell forms the extension fills in for the seller. Each site gets the
// selectors known to work, and every field falls back to finding an input by
// its label, name or placeholder, so a redesign degrades to fewer filled
// fields rather than none.
//
// Poshmark's selectors and its photos-first order come from eBayOS's
// poshmark-content.js.

import type { MarketplaceId } from '@pilego/core';

export type FieldKey = 'title' | 'description' | 'price' | 'original_price' | 'brand' | 'size';

export interface SiteAdapter {
  id: MarketplaceId;
  /** The sell form, where the extension fills things in. */
  sellPage: RegExp;
  /** Where the site sends you after a listing goes up; the capture is the listing id. */
  posted: RegExp;
  selectors: Partial<Record<FieldKey, string[]>>;
  /** The form only appears after photos are added. */
  photosFirst?: boolean;
  /** Fields this site does not have. */
  skip?: FieldKey[];
}

export const SITES: Partial<Record<MarketplaceId, SiteAdapter>> = {
  depop: {
    id: 'depop',
    sellPage: /depop\.com\/products\/create/,
    posted: /depop\.com\/products\/(?!create|edit)([a-z0-9-]+)\/?(?:\?|$)/i,
    selectors: {
      description: ['textarea[name="description"]', '#description', 'textarea[data-testid*="description" i]'],
      price: ['input[name="priceAmount"]', 'input[name="price"]', 'input[data-testid*="price" i]'],
      brand: ['input[name="brand"]', 'input[id*="brand" i]'],
    },
    skip: ['title', 'original_price'],
  },
  poshmark: {
    id: 'poshmark',
    sellPage: /poshmark\.(com|ca)\/create-listing/,
    posted: /poshmark\.(?:com|ca)\/listing\/([^/?#]+)/,
    selectors: {
      title: ['input[data-vv-name="title"]', 'input[placeholder*="What are you selling" i]'],
      description: ['textarea[data-vv-name="description"]'],
      price: ['input[data-vv-name="listingPrice"]'],
      original_price: ['input[data-vv-name="originalPrice"]'],
      brand: ['input[placeholder="Enter the Brand/Designer"]', 'input[data-vv-name="brand"]'],
    },
    photosFirst: true,
  },
  mercari: {
    id: 'mercari',
    sellPage: /mercari\.com\/sell\/?/,
    posted: /mercari\.com\/(?:us\/)?item\/(m\d+)/,
    selectors: {
      title: ['input[data-testid="Title"]', 'input[name="name"]', 'input[name="title"]'],
      description: ['textarea[data-testid="Description"]', 'textarea[name="description"]'],
      price: ['input[data-testid="Price"]', 'input[name="price"]'],
      brand: ['input[data-testid="Brand"]'],
    },
    skip: ['original_price'],
  },
  grailed: {
    id: 'grailed',
    sellPage: /grailed\.com\/sell(\/new)?/,
    posted: /grailed\.com\/listings\/(\d+)/,
    selectors: {
      title: ['input[name="title"]'],
      description: ['textarea[name="description"]'],
      price: ['input[name="price"]'],
      brand: ['input[name="designer"]', 'input[placeholder*="designer" i]'],
    },
    skip: ['original_price'],
  },
  facebook: {
    id: 'facebook',
    sellPage: /facebook\.com\/marketplace\/create\/item/,
    posted: /facebook\.com\/marketplace\/(?:item\/(\d+)|you\/selling)/,
    selectors: {},
    skip: ['original_price', 'brand', 'size'],
  },
};

export function siteFor(url: string): SiteAdapter | null {
  for (const site of Object.values(SITES)) if (site && site.sellPage.test(url)) return site;
  return null;
}

export function postedListing(market: MarketplaceId, url: string): { id: string | null; url: string } | null {
  const site = SITES[market];
  if (!site || site.sellPage.test(url)) return null;
  const hit = url.match(site.posted);
  if (!hit) return null;
  const id = hit.slice(1).find(Boolean) ?? null;
  return { id, url: id ? url.split(/[?#]/)[0]! : url };
}

/** Words that name each field in labels, placeholders and attributes. */
const HINTS: Record<FieldKey, { want: RegExp; avoid?: RegExp }> = {
  title: { want: /\btitle\b|what are you selling|item name|listing name/i, avoid: /job|subtitle/i },
  description: { want: /descri/i },
  price: { want: /\bprice\b|£|\$|€/i, avoid: /original|retail|compare|shipping|offer|minimum/i },
  original_price: { want: /original price|retail price|compare/i },
  brand: { want: /\bbrand\b|designer/i },
  size: { want: /\bsize\b/i, avoid: /package|parcel|box/i },
};

type Fillable = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

function visible(el: Element): boolean {
  const html = el as HTMLElement;
  if (html.hidden || (html as HTMLInputElement).type === 'hidden') return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(html);
  return !style || (style.display !== 'none' && style.visibility !== 'hidden');
}

function describe(el: Element): string {
  const doc = el.ownerDocument;
  const parts = [
    el.getAttribute('aria-label'),
    el.getAttribute('placeholder'),
    el.getAttribute('name'),
    el.getAttribute('id'),
    el.getAttribute('data-testid'),
  ];
  const id = el.getAttribute('id');
  if (id) parts.push(doc.querySelector(`label[for="${id.replace(/["\\]/g, '\\$&')}"]`)?.textContent ?? null);
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) for (const ref of labelledBy.split(/\s+/)) parts.push(doc.getElementById(ref)?.textContent ?? null);
  parts.push(el.closest('label')?.textContent ?? null);
  return parts.filter(Boolean).join(' ');
}

const CANDIDATES = 'input:not([type]), input[type="text"], input[type="number"], input[type="search"], textarea, [contenteditable="true"]';

/** The input for a field: the site's own selectors first, then by name. */
export function findField(doc: Document, key: FieldKey, site: SiteAdapter | null): Fillable | null {
  for (const sel of site?.selectors[key] ?? []) {
    const el = doc.querySelector<HTMLElement>(sel);
    if (el && visible(el)) return el;
  }
  const hint = HINTS[key];
  const wantsText = key === 'description';
  let best: { el: Fillable; score: number } | null = null;
  for (const el of doc.querySelectorAll<HTMLElement>(CANDIDATES)) {
    if (!visible(el) || (el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly) continue;
    const text = describe(el);
    if (!hint.want.test(text) || hint.avoid?.test(text)) continue;
    let score = 1;
    if (el.tagName === 'TEXTAREA' || el.isContentEditable) score += wantsText ? 2 : -1;
    const name = el.getAttribute('name');
    if (name && hint.want.test(name)) score += 1;
    if (!best || score > best.score) best = { el, score };
  }
  return best?.el ?? null;
}

/**
 * Set a value so the page's framework notices. React and Vue track the value
 * through the prototype setter, so assigning .value directly is ignored.
 */
export function setValue(el: Fillable, value: string): void {
  const win = el.ownerDocument.defaultView ?? window;
  el.focus();
  if (el instanceof win.HTMLInputElement || el instanceof win.HTMLTextAreaElement) {
    const proto = el instanceof win.HTMLTextAreaElement ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  } else {
    el.textContent = value;
  }
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
  el.blur();
}

export function findPhotoInput(doc: Document): HTMLInputElement | null {
  const inputs = [...doc.querySelectorAll<HTMLInputElement>('input[type="file"]')];
  return inputs.find(i => /image/.test(i.accept) || i.multiple) ?? inputs[0] ?? null;
}

/** Hand files to the site's own upload input, as if the seller had picked them. */
export function addPhotos(input: HTMLInputElement, files: File[]): void {
  const win = input.ownerDocument.defaultView ?? window;
  const transfer = new win.DataTransfer();
  for (const f of input.multiple ? files : files.slice(0, 1)) transfer.items.add(f);
  input.files = transfer.files;
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
  input.dispatchEvent(new win.Event('change', { bubbles: true }));
}
