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
  sizeWants,
} from '../src/assist/choices.ts';
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
    expect(depopPackage(item())[0]).toBe('Extra large');
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
