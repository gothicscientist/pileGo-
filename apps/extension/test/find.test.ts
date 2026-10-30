// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { keyWords, pageIsProduct, postedProductId, rankListings, shopUrl } from '../src/assist/find.ts';

/** jsdom lives on localhost; a <base> makes links resolve as they would on the site. */
function page(html: string, url = 'https://www.depop.com/radiant_jar/') {
  document.head.innerHTML = `<base href="${url}">`;
  document.body.innerHTML = html;
  return document;
}

// Real cards from a Depop shop, October 2026: Depop scrambles the username in
// the address and names the listing after the description's first line.
const DEPOP_SHOP = `
  <header><a href="/products/create/">Sell now</a><a aria-label="Likes" href="/radiant_jar/likes/">♡</a></header>
  <main>
    <a href="/products/radiant_jor-uc-berkeley-graphic-pullover-hoodie-412d/"><img alt="item listed by radiant_jar"></a>
    <a href="/products/radiavt_jar-gildan-berkeley-california-graphic-pullover-035b/"><img alt="item listed by radiant_jar"></a>
    <a href="/products/radivnt_jar-la-apparel-long-sleeve-henley-dark-c463/">SOLD<img alt="item listed by radiant_jar"></a>
  </main>`;

describe('finding the listing pileGo just posted', () => {
  it('drops ids, numbers and filler from the words it compares', () => {
    expect([...keyWords('Gildan Berkeley Hoodie Size M grey 50 cotton 6ae303b58f9d3e34681ec685 412d')]).toEqual(['gildan', 'berkeley', 'hoodie', 'grey', 'cotton']);
  });

  it('finds a Depop listing by its description’s first line, though the generated title differs', () => {
    const doc = page(DEPOP_SHOP);
    const hits = rankListings('depop', doc, ['Gildan Berkeley Graphic Pullover Hoodie Size M', 'UC Berkeley Graphic Pullover Hoodie Gildan Size M grey']);
    expect(hits[0]?.url).toBe('https://www.depop.com/products/radiant_jor-uc-berkeley-graphic-pullover-hoodie-412d/');
  });

  it('never takes an older lookalike the seller already listed', () => {
    const doc = page(DEPOP_SHOP);
    const old = 'https://www.depop.com/products/radiavt_jar-gildan-berkeley-california-graphic-pullover-035b/';
    const hits = rankListings('depop', doc, ['Gildan Berkeley California Graphic Pullover'], [old]);
    expect(hits.map(h => h.url)).not.toContain(old);
  });

  it('prefers the newest (first) of two Poshmark listings with the same title, skipping the known one', () => {
    const doc = page(
      `<a href="/listing/Gildan-Berkeley-California-Graphic-Pullover-Hoodie-Size-M-grey-50-cotton-6ae303b58f9d3e34681ec685">a</a>
       <a href="/listing/Gildan-Berkeley-California-Graphic-Pullover-Hoodie-Size-M-grey-50-cotton-6ae2fdb5f086ed163e549323">b</a>
       <a href="/listing/Lucky-Brand-Venice-Burnout-Short-Sleeve-Henley-6ae2f00cef676c4552efaa41">c</a>`,
      'https://poshmark.com/closet/buyer341',
    );
    const title = 'Gildan Berkeley California Graphic Pullover Hoodie Size M grey 50% cotton';
    expect(rankListings('poshmark', doc, [title])[0]?.id).toBe('Gildan-Berkeley-California-Graphic-Pullover-Hoodie-Size-M-grey-50-cotton-6ae303b58f9d3e34681ec685');
    const known = ['https://poshmark.com/listing/Gildan-Berkeley-California-Graphic-Pullover-Hoodie-Size-M-grey-50-cotton-6ae303b58f9d3e34681ec685'];
    expect(rankListings('poshmark', doc, [title], known)[0]?.id).toBe('Gildan-Berkeley-California-Graphic-Pullover-Hoodie-Size-M-grey-50-cotton-6ae2fdb5f086ed163e549323');
  });

  it('skips Poshmark listings made before pileGo pressed List, even a closer title match', () => {
    // Real ids from one closet: 6ae303b5… a day old, 6ae42c4f… minutes old.
    const doc = page(
      `<a href="/listing/Gildan-Berkeley-California-Graphic-Pullover-Hoodie-Size-M-grey-50-cotton-6ae303b58f9d3e34681ec685">a</a>
       <a href="/listing/UC-Berkeley-Graphic-Pullover-Hoodie-Gildan-Size-M-grey-50-cotton-college-preppy-6ae42c4f9ea6e23647a2094a">b</a>`,
      'https://poshmark.com/closet/buyer341',
    );
    const pressed = parseInt('6ae42c4f', 16) * 1000 - 60_000;
    const hits = rankListings('poshmark', doc, ['Gildan Berkeley California Graphic Pullover Hoodie Size M grey'], [], pressed);
    expect(hits.map(h => h.id)).toEqual(['UC-Berkeley-Graphic-Pullover-Hoodie-Gildan-Size-M-grey-50-cotton-college-preppy-6ae42c4f9ea6e23647a2094a']);
  });

  it('ignores listings that only share a word or two', () => {
    const doc = page(DEPOP_SHOP);
    expect(rankListings('depop', doc, ['Black Nike Hoodie'])).toEqual([]);
  });

  it('knows where each seller’s shop is', () => {
    expect(shopUrl('depop', page(DEPOP_SHOP))).toBe('https://www.depop.com/radiant_jar/');
    const posh = page('<div class="account-menu-v2__header"><a href="/closet/buyer341">@buyer341</a></div>', 'https://poshmark.com/feed');
    expect(shopUrl('poshmark', posh)).toBe('https://poshmark.com/closet/buyer341');
    expect(shopUrl('depop', page('<main>nothing</main>'))).toBeNull();
  });

  it('reads Depop’s product number off its Done screen and product pages', () => {
    expect(postedProductId('depop', 'https://www.depop.com/products/create/success/?productId=977664326')).toBe('977664326');
    expect(postedProductId('poshmark', 'https://poshmark.com/feed?productId=1')).toBeNull();
    const markup = '<script>self.__next_f.push([1,"{\\"productId\\":977664326,\\"brand\\":\\"Gildan\\"}"])</script>';
    expect(pageIsProduct(markup, '977664326')).toBe(true);
    expect(pageIsProduct(markup, '97766432')).toBe(false);
    expect(pageIsProduct('{"productId":"977664326"}', '977664326')).toBe(true);
  });
});
