// Reading comparables off Mercari's and Depop's search pages. Neither offers
// a search API to the extension, and both draw their results in the page, so
// the background opens the search in a tab it does not focus and this reads
// the result cards once they appear.
//
// Mercari: each card is [data-testid="ItemContainer"] with data-productid,
// data-brand and data-size; its text reads "SOLD | title | $24.24 | $30.00",
// the first price being what it sold for. Searched with itemStatuses=2, every
// card is a sale.
//
// Depop: search shows live listings only. Each card links to /products/...,
// labels itself with aria-label, and reads "brand | size | $12.25".

import type { PriceComp } from '@pilego/core';

export type TabCompsMarket = 'mercari' | 'depop';

const PRICE = /([$£€])\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/;
const CURRENCY: Record<string, string> = { $: 'USD', '£': 'GBP', '€': 'EUR' };

function firstPrice(text: string): { price: number; currency: string } | null {
  const m = PRICE.exec(text);
  if (!m) return null;
  const price = Number(m[2]!.replace(/,/g, ''));
  return Number.isFinite(price) && price > 0 ? { price, currency: CURRENCY[m[1]!]! } : null;
}

function clean(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

export function readMercari(doc: Document, max = 40): PriceComp[] {
  const out: PriceComp[] = [];
  const seen = new Set<string>();
  for (const card of Array.from(doc.querySelectorAll<HTMLElement>('[data-testid="ItemContainer"]'))) {
    if (out.length >= max) break;
    const id = card.dataset.productid ?? '';
    if (!/^m\d+$/.test(id) || seen.has(id)) continue;
    const name = clean(card.querySelector('[data-testid="ItemName"]')?.textContent);
    const text = clean(card.innerText || card.textContent);
    // The price comes after the title; the struck price after it is the old asking price.
    const afterName = name && text.includes(name) ? text.slice(text.indexOf(name) + name.length) : text;
    const price = firstPrice(afterName);
    if (!name || !price) continue;
    seen.add(id);
    const comp: PriceComp = {
      source: 'mercari',
      title: name.slice(0, 200),
      price: price.price,
      currency: price.currency,
      url: `https://www.mercari.com/us/item/${id}/`,
      sold: /\bsold\b/i.test(text.slice(0, 12)) || card.dataset.isOnSale === 'false',
    };
    if (card.dataset.size) comp.size = card.dataset.size.slice(0, 20);
    out.push(comp);
  }
  return out;
}

export function readDepop(doc: Document, max = 40): PriceComp[] {
  const out: PriceComp[] = [];
  const seen = new Set<string>();
  for (const link of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href*="/products/"]'))) {
    if (out.length >= max) break;
    const path = (link.getAttribute('href') ?? '').split('?')[0]!;
    if (!/^\/products\/[\w-]+\/?$/.test(path) || path.startsWith('/products/create') || seen.has(path)) continue;
    const card = link.closest('li') ?? link.parentElement;
    const text = clean(card?.innerText || card?.textContent);
    const price = firstPrice(text);
    // The link's label describes the piece; the slug after the seller's name repeats the title.
    const slugWords = path.replace(/^\/products\/[^-]+-/, '').replace(/-[0-9a-f]{4}\/?$/, '').replace(/[-/]+/g, ' ');
    const title = clean(link.getAttribute('aria-label')) || clean(slugWords);
    if (!price || !title) continue;
    seen.add(path);
    out.push({
      source: 'depop',
      title: `${clean(slugWords)} ${title}`.trim().slice(0, 200),
      price: price.price,
      currency: price.currency,
      url: `https://www.depop.com${path.endsWith('/') ? path : `${path}/`}`,
      sold: false,
    });
  }
  return out;
}

export function readComps(doc: Document, market: TabCompsMarket): PriceComp[] {
  return market === 'mercari' ? readMercari(doc) : readDepop(doc);
}
