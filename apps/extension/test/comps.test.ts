import { describe, expect, it } from 'vitest';
import { looksLikeChallenge, parsePrice, parseSoldListings, soldSearchUrl } from '../src/bg/comps.ts';

// Shaped after eBay's sold search (LH_Sold=1) as it has been served: the older
// `s-item` list, and the `s-card` list that replaced it from 2025.

const legacyItem = (id: string, title: string, price: string, opts: { newListing?: boolean; struck?: boolean } = {}) => `
<li class="s-item s-item__pl-on-bottom" id="item${id.slice(-6)}" data-viewport="{}">
  <div class="s-item__wrapper clearfix">
    <div class="s-item__image-section"><div class="s-item__image"><a tabindex="-1" href="https://www.ebay.com/itm/${id}?hash=item1&amp;amdata=enc%3A1"><img src="x.jpg" alt=""></a></div></div>
    <div class="s-item__info clearfix">
      <div class="s-item__title--tag"><div class="POSITIVE"><span class="clipped">Sold item</span><span class="s-item__title--tagblock__COMPLETED">Sold  Oct 12, 2026</span></div></div>
      <a class="s-item__link" href="https://www.ebay.com/itm/${id}?hash=item1&amp;amdata=enc%3A1">
        <div class="s-item__title">${opts.newListing ? '<span class="LIGHT_HIGHLIGHT">New Listing</span>' : ''}<span role="heading" aria-level="3">${title}</span><span class="clipped">Opens in a new window or tab</span></div>
      </a>
      <div class="s-item__subtitle"><span class="SECONDARY_INFO">Pre-Owned</span></div>
      <div class="s-item__details clearfix">
        <div class="s-item__detail s-item__detail--primary"><span class="s-item__price"><span class="${opts.struck ? 'STRIKETHROUGH POSITIVE' : 'POSITIVE'}">${price}</span></span></div>
        <div class="s-item__detail s-item__detail--primary"><span class="s-item__shipping s-item__logisticsCost">+$8.95 delivery</span></div>
      </div>
    </div>
  </div>
</li>`;

const LEGACY = `<!doctype html><html><body><div class="srp-river-results"><ul class="srp-results srp-list clearfix">
<li class="s-item s-item__pl-on-bottom" data-viewport="{}">
  <div class="s-item__wrapper clearfix"><div class="s-item__info clearfix">
    <a class="s-item__link" href="https://ebay.com/itm/123456?itmmeta=01"><div class="s-item__title"><span role="heading" aria-level="3">Shop on eBay</span></div></a>
    <div class="s-item__details clearfix"><div class="s-item__detail s-item__detail--primary"><span class="s-item__price">$20.00</span></div></div>
  </div></div>
</li>
${legacyItem('256712345678', 'Vintage GAP Arch Logo Hoodie Brown Mens Large Zip Up', '$24.99', { newListing: true })}
${legacyItem('256712345679', 'Gap Brown Arch Logo Full Zip Hoodie Sweatshirt L', '$31.00')}
${legacyItem('256712345680', 'GAP Hoodie Zip Arch Logo Brown Size M &amp; Large', '$18.50 to $22.00')}
${legacyItem('256712345681', 'Gap Arch Logo Hooded Sweatshirt Brown', '$45.00', { struck: true })}
${legacyItem('256712345682', 'Gap Vintage 90s Arch Hoodie Brown XL', '$1,024.00')}
<li class="srp-river-answer srp-river-answer--REWRITE_START"><div class="srp-river-answer--rewrite-start">Results matching fewer words</div></li>
${legacyItem('256712345683', 'Gap Kids Hoodie Blue', '$9.00')}
</ul></div></body></html>`;

const cardItem = (id: string, title: string, price: string, host = 'www.ebay.co.uk') => `
<li id="item${id.slice(-6)}" data-listingid="${id}" class="s-card s-card--horizontal s-card--dark-solt-links-blue" data-viewport="{}">
  <div class="su-card-container su-card-container--horizontal">
    <div class="su-card-container__media"><a class="su-media__image" href="https://${host}/itm/${id}?_skw=gap+hoodie&amp;hash=item3b"><img class="s-card__image" src="y.webp" alt="${title}"></a></div>
    <div class="su-card-container__content">
      <div class="su-card-container__header">
        <div class="s-card__caption"><span class="su-styled-text positive default">Sold  12 Oct 2026</span></div>
        <a class="su-link" href="https://${host}/itm/${id}?_skw=gap+hoodie&amp;hash=item3b" target="_blank"><div role="heading" aria-level="3" class="s-card__title"><span class="su-styled-text primary default">${title}</span><span class="clipped">Opens in a new window or tab</span></div></a>
        <div class="s-card__subtitle-row"><div class="s-card__subtitle"><span class="su-styled-text secondary default">Pre-owned</span></div></div>
      </div>
      <div class="su-card-container__attributes">
        <div class="su-card-container__attributes__primary">
          <div class="s-card__attribute-row"><span class="su-styled-text positive bold large-1 s-card__price">${price}</span></div>
          <div class="s-card__attribute-row"><span class="su-styled-text secondary large">+£3.99 postage</span></div>
        </div>
      </div>
    </div>
  </div>
</li>`;

const CARDS = `<!doctype html><html><body><ul class="srp-results srp-list clearfix">
${cardItem('396112233445', 'GAP Arch Logo Hoodie Brown Medium', '£16.00')}
${cardItem('396112233446', 'Gap brown zip hoodie size L vintage', '£22.50')}
${cardItem('396112233447', 'Gap Hoodie bundle', '£10.00 to £14.00')}
${cardItem('396112233448', 'Gap hoodie brown arch XS', 'US $27.10')}
${cardItem('396112233445', 'GAP Arch Logo Hoodie Brown Medium (again)', '£16.00')}
</ul></body></html>`;

describe('reading eBay sold searches', () => {
  it('reads the older s-item list', () => {
    const comps = parseSoldListings(LEGACY, 'USD');
    expect(comps).toEqual([
      {
        source: 'ebay',
        title: 'Vintage GAP Arch Logo Hoodie Brown Mens Large Zip Up',
        price: 24.99,
        currency: 'USD',
        url: 'https://www.ebay.com/itm/256712345678',
        sold: true,
      },
      { source: 'ebay', title: 'Gap Brown Arch Logo Full Zip Hoodie Sweatshirt L', price: 31, currency: 'USD', url: 'https://www.ebay.com/itm/256712345679', sold: true },
      { source: 'ebay', title: 'Gap Vintage 90s Arch Hoodie Brown XL', price: 1024, currency: 'USD', url: 'https://www.ebay.com/itm/256712345682', sold: true },
    ]);
  });

  it('skips the placeholder card, price ranges, accepted offers and loose matches', () => {
    const titles = parseSoldListings(LEGACY, 'USD').map(c => c.title);
    expect(titles).not.toContain('Shop on eBay');
    expect(titles.some(t => t.includes('Size M & Large'))).toBe(false);
    expect(titles.some(t => t.includes('Hooded Sweatshirt'))).toBe(false);
    expect(titles.some(t => t.includes('Kids'))).toBe(false);
  });

  it('reads the newer s-card list, once per item', () => {
    const comps = parseSoldListings(CARDS, 'GBP');
    expect(comps.map(c => [c.title, c.price, c.currency, c.url])).toEqual([
      ['GAP Arch Logo Hoodie Brown Medium', 16, 'GBP', 'https://www.ebay.co.uk/itm/396112233445'],
      ['Gap brown zip hoodie size L vintage', 22.5, 'GBP', 'https://www.ebay.co.uk/itm/396112233446'],
      ['Gap hoodie brown arch XS', 27.1, 'USD', 'https://www.ebay.co.uk/itm/396112233448'],
    ]);
  });

  it('stops at the limit', () => {
    expect(parseSoldListings(LEGACY, 'USD', 2)).toHaveLength(2);
  });

  it('finds nothing on a page without results', () => {
    expect(parseSoldListings('<html><body><h3 class="srp-save-null-search__heading">No exact matches found</h3></body></html>')).toEqual([]);
  });

  it('notices the bot check', () => {
    expect(looksLikeChallenge('<title>Pardon Our Interruption...</title>')).toBe(true);
    expect(looksLikeChallenge(LEGACY)).toBe(false);
  });
});

describe('prices', () => {
  it.each([
    ['$25.00', 'USD', 25, 'USD'],
    ['US $25.00', 'GBP', 25, 'USD'],
    ['£12.50', 'GBP', 12.5, 'GBP'],
    ['EUR 25,00', 'EUR', 25, 'EUR'],
    ['25,00 €', 'EUR', 25, 'EUR'],
    ['EUR 1.234,56', 'EUR', 1234.56, 'EUR'],
    ['AU $30.00', 'AUD', 30, 'AUD'],
    ['C $41.99', 'CAD', 41.99, 'CAD'],
    ['$30.00', 'AUD', 30, 'AUD'],
    ['$1,200', 'USD', 1200, 'USD'],
  ])('%s', (text, fallback, price, currency) => {
    expect(parsePrice(text, fallback)).toEqual({ price, currency });
  });

  it('gives no single price for a range', () => {
    expect(parsePrice('$20.00 to $30.00', 'USD')).toBeNull();
    expect(parsePrice('EUR 10,00 bis EUR 12,00', 'EUR')).toBeNull();
    expect(parsePrice('', 'USD')).toBeNull();
  });
});

it('builds the search for each region', () => {
  expect(soldSearchUrl('gap arch hoodie', 'US')).toBe('https://www.ebay.com/sch/i.html?_nkw=gap+arch+hoodie&LH_Sold=1&LH_Complete=1&_ipg=60');
  expect(soldSearchUrl('levi 501', 'UK')).toMatch(/^https:\/\/www\.ebay\.co\.uk\/sch\/i\.html\?/);
  expect(soldSearchUrl('levi 501', 'EU')).toMatch(/^https:\/\/www\.ebay\.de\//);
  expect(soldSearchUrl('levi 501', 'AU')).toMatch(/^https:\/\/www\.ebay\.com\.au\//);
  expect(soldSearchUrl('levi 501', 'CA')).toMatch(/^https:\/\/www\.ebay\.ca\//);
  expect(soldSearchUrl('levi 501', 'XX')).toMatch(/^https:\/\/www\.ebay\.com\//);
});
