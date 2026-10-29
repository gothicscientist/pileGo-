// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isServerError, pageError, serverAlerts } from '../src/assist/dom.ts';
import { findField, leftForm, postedListing, setValue, SITES, siteFor } from '../src/assist/sites.ts';

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

describe('after pressing post', () => {
  it('counts the closet or feed as moved on, but not the form or the login page', () => {
    expect(leftForm('poshmark', 'https://poshmark.com/listing/Levis-Jacket-65a1b2')).toBe(true);
    expect(leftForm('poshmark', 'https://poshmark.com/closet/sam')).toBe(true);
    expect(leftForm('poshmark', 'https://poshmark.com/')).toBe(true);
    expect(leftForm('poshmark', 'https://poshmark.com/create-listing?draft=1')).toBe(false);
    expect(leftForm('poshmark', 'https://poshmark.com/login')).toBe(false);
    expect(leftForm('depop', 'https://www.depop.com/sam/')).toBe(true);
    expect(leftForm('depop', 'https://www.depop.com/products/create/')).toBe(false);
    expect(leftForm('mercari', 'https://www.mercari.com/mypage/')).toBe(false);
  });
});

describe('server errors', () => {
  it('tells a server failure from a form complaint', () => {
    expect(isServerError('Request failed with status code 500')).toBe(true);
    expect(isServerError('Something went wrong, please try again')).toBe(true);
    expect(isServerError('502 Bad Gateway')).toBe(true);
    expect(isServerError('Error 500')).toBe(true);
    expect(isServerError('Over 500 sold this week')).toBe(false);
    expect(isServerError('Add at least one photo')).toBe(false);
    expect(isServerError('Price must be at least $5')).toBe(false);
  });

  it('spots a 500 page by its heading', () => {
    expect(pageError(page('<h1>500 - Internal Server Error</h1>'))).toBe('500 - Internal Server Error');
    expect(pageError(page('<h1>Sell an item</h1><form></form>'))).toBeNull();
  });

  it('reads server errors from toasts and alerts only', () => {
    const doc = page(`
      <div role="alert">Request failed with status code 500</div>
      <div class="error">Please add a size</div>
      <p>Our 500 favourite brands</p>`);
    // jsdom lays nothing out, so give the alert a box.
    for (const el of doc.querySelectorAll<HTMLElement>('[role="alert"], .error')) el.getClientRects = () => [{}] as unknown as DOMRectList;
    expect(serverAlerts(doc)).toEqual(['Request failed with status code 500']);
  });
});
