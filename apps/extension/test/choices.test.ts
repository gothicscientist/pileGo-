import { describe, expect, it } from 'vitest';
import {
  decade,
  depopAge,
  depopCategoryTerms,
  depopColours,
  depopPackage,
  depopSource,
  depopStyles,
  poshmarkCategory,
  poshmarkColours,
  poshmarkTags,
  grailedCategory,
  grailedColour,
  grailedStyle,
  mercariCategory,
  pickSize,
  sizeLabels,
  sizeWants,
} from '../src/assist/choices.ts';
import { addressParts } from '../src/assist/address.ts';
import { pickOption } from '../src/assist/dom.ts';

const item = (over: Record<string, unknown> = {}) => ({
  sku: 'X',
  brand: 'GAP',
  department: 'unisex',
  category: 'outerwear',
  subcategory: 'jackets',
  size: 'M',
  colors: ['brown'],
  condition: 'excellent',
  original_price: null,
  materials: [],
  style_tags: [],
  era: null,
  ...over,
});

describe('Depop choices', () => {
  it('searches the category by the item’s own words', () => {
    expect(depopCategoryTerms(item())).toContain('Jackets');
    expect(depopCategoryTerms(item({ category: 'bottoms', subcategory: 'joggers' }))[0]).toBe('Sweatpants');
  });
  it('maps colours to Depop’s list, two at most', () => {
    expect(depopColours(item({ colors: ['light blue', 'gray', 'olive'] }))).toEqual(['Blue', 'Grey']);
    expect(depopColours(item({ colors: ['beige'] }))).toEqual(['Tan']);
  });
  it('reads source, age and style from the era and tags', () => {
    expect(depopSource(item())).toEqual(['Preloved']);
    expect(depopSource(item({ era: '90s' }))).toEqual(['Vintage']);
    expect(depopAge(item())).toEqual(['Modern']);
    expect(depopAge(item({ era: '90s' }))).toEqual(['90s']);
    expect(depopAge(item({ era: 'Y2K' }))).toEqual(['00s']);
    expect(depopStyles(item({ style_tags: ['workwear', 'streetwear', 'grunge', 'goth'] }))).toEqual(['Utility', 'Streetwear', 'Grunge']);
    expect(depopStyles(item())).toEqual(['Casual']);
  });
  it('sizes the parcel by the kind of item', () => {
    expect(depopPackage(item())[0]).toBe('Large');
    expect(depopPackage(item({ subcategory: 'coats' }))[0]).toBe('Extra large');
    expect(depopPackage(item({ category: 'knitwear', subcategory: 'hoodies' }))[0]).toBe('Large');
    expect(depopPackage(item({ category: 'dresses', subcategory: 'mini-dresses' }))[0]).toBe('Medium');
    expect(depopPackage(item({ category: 'tops', subcategory: 't-shirts' }))[0]).toBe('Small');
  });
});

describe('Poshmark choices', () => {
  it('picks department, category and subcategory', () => {
    expect(poshmarkCategory(item())).toEqual({ department: 'men', category: ['Jackets & Coats'], subcategory: ['Lightweight & Shirt Jackets', 'Bomber & Varsity'] });
    expect(poshmarkCategory(item({ department: 'women', category: 'tops', subcategory: 'blouses' }))).toMatchObject({ category: ['Tops'], subcategory: ['Blouses'] });
    expect(poshmarkCategory(item({ department: 'women', category: 'knitwear', subcategory: 'hoodies' }))).toMatchObject({ category: ['Tops'], subcategory: ['Sweatshirts & Hoodies'] });
  });
  it('maps colours and tags', () => {
    expect(poshmarkColours(item({ colors: ['grey', 'navy'] }))).toEqual(['Gray', 'Blue']);
    expect(poshmarkTags(item({ style_tags: ['workwear'], era: '90s', materials: ['cotton', 'denim'] }))).toEqual(['Workwear', '90s', 'Cotton']);
    expect(poshmarkTags(item())).toEqual(['Casual']);
  });
});

describe('matching', () => {
  it('writes sizes the ways size lists do', () => {
    expect(sizeWants('M')).toEqual(['M']);
    expect(sizeWants('Medium')).toContain('M');
    expect(sizeWants('US 10')).toContain('10');
    expect(sizeWants('W32 L30')).toEqual(expect.arrayContaining(['32', '32"']));
    expect(sizeWants('One size')).toContain('One size');
  });
  it('prefers exact options, then whole words, never fragments', () => {
    const opts = ['Used - Excellent', 'Used - Good', 'Like new'];
    expect(pickOption(opts, o => o, ['Used - Good', 'Good'])).toBe('Used - Good');
    expect(pickOption(opts, o => o, ['Good'])).toBe('Used - Good');
    expect(pickOption(['XS', 'S', 'M', 'XL'], o => o, ['L'])).toBeNull();
    expect(pickOption(['New With Tags (NWT)', 'Like New'], o => o, ['New With Tags'])).toBe('New With Tags (NWT)');
  });
  it('reads decades', () => {
    expect(decade('90s')).toBe(1990);
    expect(decade('1970s')).toBe(1970);
    expect(decade('modern')).toBeNull();
  });
});

describe('Mercari choices', () => {
  it('walks department, category and subcategory', () => {
    expect(mercariCategory(item({ department: 'men', category: 'tops', subcategory: 't-shirts' }))).toEqual({ department: 'Men', category: ['Tops'], subcategory: ['T-shirts'] });
    expect(mercariCategory(item({ department: 'women', category: 'dresses', subcategory: 'mini-dresses' })).subcategory).toEqual(['Above knee, mini']);
    expect(mercariCategory(item({ department: 'unisex', category: 'knitwear', subcategory: 'hoodies' }))).toMatchObject({ department: 'Men', category: ['Sweats & hoodies'] });
    expect(mercariCategory(item({ department: 'kids', category: 'dresses', subcategory: 'midi-dresses' }))).toEqual({ department: 'Kids', category: ['Girls dresses'], subcategory: ['Girls (4+)'] });
  });
});

describe('Grailed choices', () => {
  it('picks Grailed’s department, category and subcategory', () => {
    expect(grailedCategory(item({ department: 'men', category: 'bottoms', subcategory: 'jeans' }))).toEqual({ department: 'Menswear', category: ['Bottoms'], subcategory: ['Denim'] });
    expect(grailedCategory(item({ department: 'women', category: 'outerwear', subcategory: 'puffers' }))).toEqual({ department: 'Womenswear', category: ['Outerwear'], subcategory: ['Down Jackets'] });
  });
  it('takes one colour, Multi for many', () => {
    expect(grailedColour(item({ colors: ['navy'] }))).toBe('Blue');
    expect(grailedColour(item({ colors: ['red', 'blue', 'green'] }))).toBe('Multi');
    expect(grailedColour(item({ colors: [] }))).toBeNull();
  });
  it('maps the style, or leaves it unset', () => {
    expect(grailedStyle(item({ style_tags: ['utility'] }))).toBe('Workwear');
    expect(grailedStyle(item({ era: '90s' }))).toBe('Vintage');
    expect(grailedStyle(item())).toBeNull();
  });
});

describe('size lists', () => {
  it('reads sizes the ways sites label them', () => {
    expect(sizeLabels('M (38-40)')).toContain('M');
    expect(sizeLabels('US M / EU 48-50 / 2')).toContain('M');
    expect(sizeLabels('32 in.')).toContain('32');
  });
  it('picks the first matching size, not a lookalike', () => {
    const mercari = ['XS (30-32)', 'S (34-36)', 'M (38-40)', 'L (42-44)', 'M', 'L'];
    expect(pickSize(mercari, s => s, 'M')).toBe('M (38-40)');
    const grailed = ['US XS / EU 42 / 0', 'US S / EU 44-46 / 1', 'US M / EU 48-50 / 2'];
    expect(pickSize(grailed, s => s, 'S')).toBe('US S / EU 44-46 / 1');
    expect(pickSize(['US 30 / EU 46', 'US 31', 'US 32 / EU 48'], s => s, 'W32')).toBe('US 32 / EU 48');
    expect(pickSize(['23 in.', '32 in.'], s => s, '32x30')).toBe('32 in.');
    expect(pickSize(['XS', 'S'], s => s, 'XL')).toBeNull();
  });
});

describe('the setup address', () => {
  const address = { full_name: 'Sam Lee Park', line1: '1 Main St', line2: '', city: 'Austin', state: 'texas', postal_code: '78701', country: 'US', phone: '' };
  it('splits the name and gives the state both ways', () => {
    expect(addressParts(address)).toMatchObject({ first_name: 'Sam Lee', last_name: 'Park', state_code: 'TX', state_name: 'Texas' });
    expect(addressParts({ ...address, state: 'CA' })).toMatchObject({ state_code: 'CA', state_name: 'California' });
  });
  it('is null when there is none, or it is incomplete', () => {
    expect(addressParts(null)).toBeNull();
    expect(addressParts({ ...address, line1: '' })).toBeNull();
  });
});
