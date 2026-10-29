// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readDepop, readMercari } from '../src/assist/comps.ts';

function page(html: string) {
  document.body.innerHTML = html;
  return document;
}

// Shaped after Mercari's and Depop's search results as they render in 2026.
const mercariCard = (id: string, name: string, prices: string[], size = '32 in.') => `
<div data-testid="ItemContainer" data-productid="${id}" data-is-on-sale="false" data-brand="Levi's" data-size="${size}">
  <div data-testid="StyledProductThumb"><span>SOLD</span></div>
  <p data-testid="ItemName">${name}</p>
  <div>${prices.map(p => `<span>${p}</span>`).join('')}</div>
</div>`;

describe('Mercari sold search', () => {
  it('reads each sale once, with the price it sold for', () => {
    const doc = page(
      mercariCard('m10470991812', 'VTG Levi 501 Medium Wash', ['$24.24', '$30.00']) +
        mercariCard('m84836278026', "Levi's Ribcage Bootcut NWT", ['$1,057.00']) +
        mercariCard('m10470991812', 'VTG Levi 501 Medium Wash', ['$24.24']) +
        mercariCard('bad', 'No id', ['$5.00']) +
        mercariCard('m1', 'No price', []),
    );
    expect(readMercari(doc)).toEqual([
      { source: 'mercari', title: 'VTG Levi 501 Medium Wash', price: 24.24, currency: 'USD', url: 'https://www.mercari.com/us/item/m10470991812/', sold: true, size: '32 in.' },
      { source: 'mercari', title: "Levi's Ribcage Bootcut NWT", price: 1057, currency: 'USD', url: 'https://www.mercari.com/us/item/m84836278026/', sold: true, size: '32 in.' },
    ]);
  });
});

describe('Depop search', () => {
  it('reads live listings from the cards', () => {
    const doc = page(`<ul>
      <li><a href="/products/create/">Sell now</a></li>
      <li><a href="/products/zicgotzalezzz-levis-501-navy-blue-jeans-4826/?isBoostedView=true" aria-label="Levi's men's navy jeans"></a><p>Levi's</p><p>32"</p><p>$12.25</p><p>Boosted</p></li>
      <li><a href="/products/zicgotzalezzz-levis-501-navy-blue-jeans-4826/" aria-label="Levi's men's navy jeans"></a><p>Levi's</p><p>32"</p><p>$12.25</p></li>
      <li><a href="/products/wjlc8-levis-501-blue-jeans-size-a470/" aria-label="Levi's men's blue jeans"></a><p>Levi's</p><p>$10.26</p></li>
    </ul>`);
    const comps = readDepop(doc);
    expect(comps.map(c => [c.price, c.sold, c.url])).toEqual([
      [12.25, false, 'https://www.depop.com/products/zicgotzalezzz-levis-501-navy-blue-jeans-4826/'],
      [10.26, false, 'https://www.depop.com/products/wjlc8-levis-501-blue-jeans-size-a470/'],
    ]);
    expect(comps[0]!.title).toContain('levis 501 navy blue jeans');
    expect(comps[0]!.title).toContain("Levi's men's navy jeans");
  });
});
