import { describe, expect, it } from 'vitest';
import type { ListingWork } from '../src/shared/messages.ts';
import {
  buildDraft,
  catalogKey,
  forCompletion,
  isSold,
  listedAt,
  matchBrand,
  matchCatalog,
  matchColours,
  matchSize,
  priceOf,
  toPileItem,
  type CatalogNode,
} from '../src/vinted/map.ts';

const tree: CatalogNode[] = [
  {
    id: 1904,
    title: 'Women',
    catalogs: [
      {
        id: 4,
        title: 'Clothing',
        catalogs: [
          { id: 1037, title: 'Outerwear', catalogs: [{ id: 1907, title: 'Jackets' }, { id: 2525, title: 'Denim jackets' }, { id: 1908, title: 'Coats' }] },
          { id: 12, title: 'Tops & t-shirts', catalogs: [{ id: 221, title: 'T-shirts' }, { id: 222, title: 'Blouses' }, { id: 1043, title: 'Other tops & t-shirts' }] },
          { id: 13, title: 'Jumpers & sweaters', catalogs: [{ id: 196, title: 'Jumpers' }, { id: 1874, title: 'Hoodies & sweatshirts' }] },
        ],
      },
    ],
  },
  {
    id: 5,
    title: 'Men',
    catalogs: [
      {
        id: 2050,
        title: 'Clothing',
        catalogs: [
          { id: 76, title: 'Tops & t-shirts', catalogs: [{ id: 77, title: 'T-shirts' }, { id: 1801, title: 'Shirts' }] },
          { id: 79, title: 'Jumpers & sweaters', catalogs: [{ id: 267, title: 'Hoodies & sweatshirts' }, { id: 1811, title: 'Jumpers' }] },
          { id: 1206, title: 'Outerwear', catalogs: [{ id: 2052, title: 'Jackets' }, { id: 2556, title: 'Denim jackets' }] },
        ],
      },
    ],
  },
];

describe('matchCatalog', () => {
  it('finds the leaf under the right department', () => {
    expect(matchCatalog(tree, { department: 'women', category: 'outerwear', subcategory: 'denim-jackets' })?.id).toBe(2525);
    expect(matchCatalog(tree, { department: 'men', category: 'outerwear', subcategory: 'denim-jackets' })?.id).toBe(2556);
    expect(matchCatalog(tree, { department: 'women', category: 'tops', subcategory: 't-shirts' })?.id).toBe(221);
  });
  it('treats unisex as men', () => {
    expect(matchCatalog(tree, { department: 'unisex', category: 'tops', subcategory: 'shirts' })?.id).toBe(1801);
  });
  it('matches through the search words', () => {
    expect(matchCatalog(tree, { department: 'women', category: 'knitwear', subcategory: 'sweaters' })?.id).toBe(196);
    expect(matchCatalog(tree, { department: 'men', category: 'knitwear', subcategory: 'hoodies' })?.id).toBe(267);
  });
  it('gives up rather than guessing', () => {
    expect(matchCatalog(tree, { department: 'women', category: 'shoes', subcategory: 'boots' })).toBeNull();
    expect(matchCatalog(tree, { department: 'women', category: null, subcategory: null })).toBeNull();
  });
});

describe('matchSize', () => {
  const groups = [
    {
      sizes: [
        { id: 2, title: 'XS / 34 / 6' },
        { id: 3, title: 'S / 36 / 8' },
        { id: 4, title: 'M / 38 / 10' },
        { id: 5, title: 'L / 40 / 12' },
        { id: 6, title: 'XXL / 44 / 16' },
        { id: 1, title: 'One size' },
      ],
    },
  ];
  it('matches letters, numbers and prefixed numbers', () => {
    expect(matchSize(groups, 'M')).toBe(4);
    expect(matchSize(groups, 's')).toBe(3);
    expect(matchSize(groups, 'UK 10')).toBe(4);
    expect(matchSize(groups, '12')).toBe(5);
    expect(matchSize(groups, 'one size')).toBe(1);
  });
  it('does not confuse XS with S', () => {
    expect(matchSize(groups, 'XS')).toBe(2);
  });
  it('returns null for unknown sizes', () => {
    expect(matchSize(groups, 'W32 L30')).toBeNull();
    expect(matchSize(groups, null)).toBeNull();
  });
  it('matches waist sizes in jeans groups', () => {
    expect(matchSize([{ sizes: [{ id: 30, title: 'W30' }, { id: 32, title: 'W32 | FR 42' }] }], 'W32')).toBe(32);
  });
});

describe('colours and brands', () => {
  it('uses the list when there is one and the basics otherwise', () => {
    expect(matchColours(['Navy', 'White'], [{ id: 27, title: 'Navy' }, { id: 12, title: 'White' }])).toEqual([27, 12]);
    expect(matchColours(['black', 'light grey', 'red'], null)).toEqual([1, 3]);
    expect(matchColours(['chartreuse'], null)).toEqual([]);
  });
  it('wants an exact brand', () => {
    const list = [{ id: 53, title: 'Nike' }, { id: 1, title: 'Nike ACG' }];
    expect(matchBrand(list, 'nike')).toEqual({ id: 53, title: 'Nike' });
    expect(matchBrand(list, 'Adidas')).toBeNull();
  });
});

const work: ListingWork = {
  job_id: 'j1',
  listing_id: 'l1',
  marketplace: 'vinted',
  listing: {
    marketplace: 'vinted',
    title: 'Levi’s denim trucker jacket',
    description: 'Lovely jacket.',
    hashtags: [],
    price: 32,
    currency: 'GBP',
    condition_label: 'Good',
    category_path: '',
    fields: [],
    warnings: [],
  },
  item: { sku: 'OUT-1', brand: 'Levi’s', department: 'women', category: 'outerwear', subcategory: 'denim-jackets', size: 'M', colors: ['blue'], condition: 'good', original_price: null, materials: [], style_tags: [], era: null },
  photos: [],
  learned: {},
  external_id: null,
  external_url: null,
};

describe('drafts', () => {
  const ids = { catalog_id: 2525, brand_id: 10, brand: 'Levi’s', size_id: 4, color_ids: [9], is_unisex: false };
  it('builds the draft Vinted’s form sends', () => {
    const d = buildDraft(work, ids, 'sess', [{ id: 99, orientation: 0 }]);
    expect(d).toMatchObject({
      title: 'Levi’s denim trucker jacket',
      price: 32,
      currency: 'GBP',
      catalog_id: 2525,
      size_id: 4,
      status_id: 3,
      assigned_photos: [{ id: 99, orientation: 0 }],
      package_size_id: 2,
      temp_uuid: 'sess',
    });
    expect(d.item_attributes).toEqual([
      { code: 'size', ids: [4] },
      { code: 'condition', ids: [3] },
    ]);
  });
  it('renames photos and sets the id for completion', () => {
    const d = forCompletion(buildDraft(work, ids, 'sess', [{ id: 99 }]), 555);
    expect(d.id).toBe(555);
    expect(d.photos).toEqual([{ id: 99, orientation: 0 }]);
    expect('assigned_photos' in d).toBe(false);
  });
  it('keys catalogs by department, category and subcategory', () => {
    expect(catalogKey(work.item)).toBe('women/outerwear/denim-jackets');
  });
});

describe('reading Vinted back', () => {
  it('knows a sale from a hidden item', () => {
    expect(isSold({ id: 1, is_closed: true })).toBe(true);
    expect(isSold({ id: 1, is_closed: true, item_closing_action: 'sold' })).toBe(true);
    expect(isSold({ id: 1, is_closed: true, item_closing_action: 'hidden' })).toBe(false);
    expect(isSold({ id: 1, is_closed: false })).toBe(false);
  });
  it('reads prices in every shape', () => {
    expect(priceOf({ price: { amount: '12.5', currency_code: 'EUR' } })).toBe(12.5);
    expect(priceOf({ price: '7,00' })).toBe(7);
    expect(priceOf({ price_numeric: '9.99' })).toBe(9.99);
  });
  it('dates a listing from its oldest photo', () => {
    expect(listedAt({ id: 1, photos: [{ high_resolution: { timestamp: 1_700_000_000 } }, { high_resolution: { timestamp: '1690000000' } }] })).toBe(
      new Date(1_690_000_000_000).toISOString(),
    );
  });
  it('turns an editable item into a pileGo item', () => {
    const pile = toPileItem(
      { id: 1, title: 'Denim jacket', description: 'Worn twice', brand_title: 'Levi’s', size_title: 'M', status_id: 2, price: { amount: '30', currency_code: 'GBP' } },
      ['Women', 'Clothing', 'Outerwear', 'Denim jackets'],
    );
    expect(pile).toMatchObject({ department: 'women', category: 'outerwear', subcategory: 'denim-jackets', condition: 'excellent', price: 30, currency: 'GBP', brand: 'Levi’s' });
  });
});

describe('telling whether a Vinted tab is logged in', () => {
  it('reads the member from the markup Vinted draws the page with', async () => {
    const { userFromMarkup } = await import('../src/vinted/map.ts');
    const inPage = 'self.__next_f.push([1,"{\\"sessionProps\\":{\\"initialSessionData\\":{\\"userId\\":3167409088,\\"isWebview\\":false}}}"])';
    expect(userFromMarkup(inPage)).toBe('3167409088');
    expect(userFromMarkup('{"initialUserState":{"user":{"id":42,"login":"sam"}}}')).toBe('42');
    expect(userFromMarkup('{"initialSessionData":{"userId":null,"isWebview":false}}')).toBeNull();
    expect(userFromMarkup('<html>no session here</html>')).toBeUndefined();
  });
});
