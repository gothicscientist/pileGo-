// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { findField, postedListing, setValue, SITES, siteFor } from '../src/assist/sites.ts';

function page(html: string) {
  document.body.innerHTML = html;
  return document;
}

describe('finding fields', () => {
  it('uses the site’s own selectors first', () => {
    const doc = page(`
      <input data-vv-name="title" />
      <input placeholder="Enter the Brand/Designer" />
      <input data-vv-name="listingPrice" />
      <input data-vv-name="originalPrice" />
      <textarea data-vv-name="description"></textarea>`);
    const site = SITES.poshmark!;
    expect(findField(doc, 'title', site)?.getAttribute('data-vv-name')).toBe('title');
    expect(findField(doc, 'price', site)?.getAttribute('data-vv-name')).toBe('listingPrice');
    expect(findField(doc, 'original_price', site)?.getAttribute('data-vv-name')).toBe('originalPrice');
    expect(findField(doc, 'brand', site)?.getAttribute('placeholder')).toBe('Enter the Brand/Designer');
  });

  it('falls back to labels when the markup changes', () => {
    const doc = page(`
      <label><span>Title</span><input id="a" /></label>
      <label for="b">Describe your item</label><textarea id="b"></textarea>
      <label><span>Original price</span><input id="c" /></label>
      <label><span>Price</span><input id="d" /></label>
      <label><span>Package size</span><input id="e" /></label>
      <label><span>Size</span><input id="f" /></label>`);
    expect(findField(doc, 'title', null)?.id).toBe('a');
    expect(findField(doc, 'description', null)?.id).toBe('b');
    expect(findField(doc, 'price', null)?.id).toBe('d');
    expect(findField(doc, 'original_price', null)?.id).toBe('c');
    expect(findField(doc, 'size', null)?.id).toBe('f');
  });

  it('skips hidden and disabled inputs', () => {
    const doc = page(`<input name="title" type="hidden" /><input name="title" disabled /><input name="title" id="ok" />`);
    expect(findField(doc, 'title', null)?.id).toBe('ok');
  });
});

describe('setting values', () => {
  it('goes through the prototype setter and fires input and change', () => {
    const doc = page('<input id="x" />');
    const input = doc.getElementById('x') as HTMLInputElement;
    const seen: string[] = [];
    input.addEventListener('input', () => seen.push(`input:${input.value}`));
    input.addEventListener('change', () => seen.push('change'));
    setValue(input, '42');
    expect(input.value).toBe('42');
    expect(seen).toEqual(['input:42', 'change']);
  });
});

describe('pages', () => {
  it('knows the sell forms', () => {
    expect(siteFor('https://www.depop.com/products/create/')?.id).toBe('depop');
    expect(siteFor('https://poshmark.com/create-listing')?.id).toBe('poshmark');
    expect(siteFor('https://www.mercari.com/sell/')?.id).toBe('mercari');
    expect(siteFor('https://www.depop.com/products/abc/')).toBeNull();
  });
  it('spots the posted listing', () => {
    expect(postedListing('depop', 'https://www.depop.com/products/sam-levis-jacket-1234/')).toEqual({
      id: 'sam-levis-jacket-1234',
      url: 'https://www.depop.com/products/sam-levis-jacket-1234/',
    });
    expect(postedListing('depop', 'https://www.depop.com/products/create/')).toBeNull();
    expect(postedListing('poshmark', 'https://poshmark.com/listing/Levis-Jacket-65a1b2?x=1')?.id).toBe('Levis-Jacket-65a1b2');
    expect(postedListing('mercari', 'https://www.mercari.com/us/item/m12345678/')?.id).toBe('m12345678');
    expect(postedListing('grailed', 'https://www.grailed.com/listings/5551234-levis')?.id).toBe('5551234');
    expect(postedListing('facebook', 'https://www.facebook.com/marketplace/you/selling')?.url).toBe('https://www.facebook.com/marketplace/you/selling');
  });
});
