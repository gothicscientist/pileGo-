// What to pick in Depop's and Poshmark's dropdowns for a pileGo item. Pure
// functions, so the guessing can be tested without the sites. Option names
// were read off the live sell forms (October 2026); the drivers match them
// loosely, so a renamed option degrades to an empty field, not a wrong one.

import { CONDITION_WORDS, findSubcategory, isCondition, type Condition } from '@pilego/core';
import type { ListingWork } from '../shared/messages.ts';

type Item = ListingWork['item'];

const lower = (s: string | null | undefined) => (s ?? '').toLowerCase().trim();

function conditionOf(item: Item): Condition {
  return isCondition(item.condition) ? item.condition : 'good';
}

export function conditionWords(market: 'depop' | 'poshmark', item: Item): string[] {
  return CONDITION_WORDS[market]?.[conditionOf(item)] ?? [];
}

/** Decade the item is from, as a number (1990), when the era says so. */
export function decade(era: string | null | undefined): number | null {
  const e = lower(era);
  if (!e) return null;
  if (/y2k|2000s|00s/.test(e)) return 2000;
  const short = e.match(/\b([2-9])0s\b/);
  if (short) return 1900 + Number(short[1]) * 10;
  const long = e.match(/\b(19[0-9])0s?\b/);
  if (long) return Number(long[1]) * 10;
  return null;
}

function isVintage(item: Item): boolean {
  const d = decade(item.era);
  return (d != null && d < 2000) || item.style_tags.some(t => /vintage/i.test(t)) || /vintage/i.test(item.era ?? '');
}

// ---------------------------------------------------------------------------
// Depop
// ---------------------------------------------------------------------------

/** The heading Depop puts over each category option: MEN, WOMEN or KIDS. */
export function depopDepartment(item: Item): 'men' | 'women' | 'kids' {
  if (item.department === 'women' || item.department === 'kids') return item.department;
  return 'men';
}

/** Words to type into Depop's category search, most specific first. */
export function depopCategoryTerms(item: Item): string[] {
  const sub = findSubcategory(item.category, item.subcategory);
  const extra: Record<string, string[]> = {
    't-shirts': ['T-shirts'],
    'tank-tops': ['Vests', 'Tank tops'],
    polos: ['Polo shirts'],
    hoodies: ['Hoodies'],
    sweaters: ['Jumpers', 'Sweaters'],
    'denim-jackets': ['Jackets'],
    'leather-jackets': ['Jackets'],
    puffers: ['Coats', 'Jackets'],
    gilets: ['Gilets', 'Vests', 'Jackets'],
    blazers: ['Blazers', 'Suits'],
    'mini-dresses': ['Dresses'],
    'midi-dresses': ['Dresses'],
    'maxi-dresses': ['Dresses'],
    jumpsuits: ['Jumpsuits', 'Playsuits'],
    trousers: ['Trousers', 'Pants'],
    joggers: ['Sweatpants', 'Joggers'],
    'sports-tops': ['Activewear', 'Tops'],
    'sports-bottoms': ['Activewear', 'Leggings'],
    tracksuits: ['Tracksuits'],
    jerseys: ['Jerseys', 'T-shirts'],
    sneakers: ['Trainers', 'Sneakers'],
    flats: ['Flats', 'Loafers'],
    handbags: ['Bags', 'Handbags'],
    totes: ['Tote bags', 'Bags'],
    crossbody: ['Crossbody bags', 'Bags'],
    hats: ['Hats', 'Caps'],
    jewellery: ['Jewelry', 'Jewellery', 'Necklaces'],
  };
  const words = [...(extra[item.subcategory ?? ''] ?? []), ...(sub ? [sub.label, ...sub.search] : [])];
  if (!words.length && item.category) words.push(item.category);
  return [...new Set(words)];
}

const DEPOP_COLOURS: Record<string, string> = {
  black: 'Black',
  grey: 'Grey',
  gray: 'Grey',
  charcoal: 'Grey',
  white: 'White',
  ivory: 'Cream',
  brown: 'Brown',
  chocolate: 'Brown',
  tan: 'Tan',
  camel: 'Tan',
  beige: 'Tan',
  cream: 'Cream',
  yellow: 'Yellow',
  mustard: 'Yellow',
  red: 'Red',
  burgundy: 'Burgundy',
  maroon: 'Burgundy',
  wine: 'Burgundy',
  orange: 'Orange',
  pink: 'Pink',
  purple: 'Purple',
  lilac: 'Purple',
  blue: 'Blue',
  denim: 'Blue',
  navy: 'Navy',
  green: 'Green',
  olive: 'Khaki',
  khaki: 'Khaki',
  multi: 'Multi',
  multicolour: 'Multi',
  multicolor: 'Multi',
  silver: 'Silver',
  gold: 'Gold',
};

function mapColours(colors: string[], table: Record<string, string>, max: number): string[] {
  const out: string[] = [];
  for (const raw of colors) {
    const words = lower(raw).split(/[^a-z]+/).filter(Boolean);
    // "light blue" is blue; the last word is the colour.
    const hit = table[words.join('')] ?? table[words[words.length - 1] ?? ''] ?? words.map(w => table[w]).find(Boolean);
    if (hit && !out.includes(hit)) out.push(hit);
    if (out.length === max) break;
  }
  return out;
}

export function depopColours(item: Item): string[] {
  return mapColours(item.colors, DEPOP_COLOURS, 2);
}

/** Depop's Source: where the piece came from. */
export function depopSource(item: Item): string[] {
  if (isVintage(item)) return ['Vintage'];
  if (item.style_tags.some(t => /upcycl|rework/i.test(t))) return ['Reworked / Upcycled'];
  if (item.style_tags.some(t => /handmade/i.test(t))) return ['Handmade'];
  return ['Preloved'];
}

/** Depop's Age: Modern, 00s, 90s … Antique. */
export function depopAge(item: Item): string[] {
  const d = decade(item.era);
  if (d == null || d >= 2010) return ['Modern'];
  if (d === 2000) return ['00s'];
  if (d >= 1950) return [`${String(d).slice(2)}s`];
  return ['Antique'];
}

const DEPOP_STYLES = [
  'Streetwear', 'Sportswear', 'Loungewear', 'Goth', 'Retro', 'Boho', 'Western', 'Indie', 'Skater', 'Rave', 'Costume',
  'Cosplay', 'Grunge', 'Emo', 'Minimalist', 'Preppy', 'Avant Garde', 'Punk', 'Glam', 'Regency', 'Casual', 'Utility',
  'Futuristic', 'Cottage', 'Fairy', 'Kidcore', 'Y2K', 'Biker', 'Gorpcore', 'Twee', 'Coquette', 'Whimsygoth',
];

const STYLE_SYNONYMS: Record<string, string> = {
  workwear: 'Utility',
  bohemian: 'Boho',
  cottagecore: 'Cottage',
  fairycore: 'Fairy',
  athleisure: 'Sportswear',
  sporty: 'Sportswear',
  athletic: 'Sportswear',
  vintage: 'Retro',
  minimal: 'Minimalist',
  outdoor: 'Gorpcore',
  skate: 'Skater',
  gothic: 'Goth',
};

/** Up to three Depop styles from the item's own tags, with a sensible default. */
export function depopStyles(item: Item): string[] {
  const out: string[] = [];
  const add = (s: string | undefined) => {
    if (s && !out.includes(s) && out.length < 3) out.push(s);
  };
  for (const tag of [...item.style_tags, item.era ?? '']) {
    const t = lower(tag).replace(/[^a-z0-9 ]/g, '');
    if (!t) continue;
    add(DEPOP_STYLES.find(s => s.toLowerCase() === t) ?? STYLE_SYNONYMS[t.replace(/\s+/g, '')]);
  }
  if (!out.length) add(item.category === 'activewear' ? 'Sportswear' : 'Casual');
  return out;
}

/** Package size names, lightest first, to try for the item's weight. */
export function depopPackage(item: Item): string[] {
  const heavy = ['outerwear', 'shoes', 'bags'];
  const light = ['tops', 'accessories'];
  if (heavy.includes(item.category ?? '')) return ['Extra large', 'Large'];
  if (light.includes(item.category ?? '') && item.subcategory !== 'hoodies') return ['Small', 'Medium'];
  return ['Large', 'Medium'];
}

/** Ways the item's size may be written on a size list. */
export function sizeWants(size: string | null | undefined): string[] {
  const raw = (size ?? '').trim();
  if (!raw) return [];
  const out = [raw];
  const up = raw.toUpperCase();
  const stripped = up.replace(/^(US|UK|EU|IT|FR|INT)\s*/, '').replace(/\s*\((.*)\)$/, '').trim();
  if (stripped && stripped !== up) out.push(stripped);
  const alias: Record<string, string> = {
    'X-SMALL': 'XS', 'EXTRA SMALL': 'XS', SMALL: 'S', MEDIUM: 'M', LARGE: 'L', 'X-LARGE': 'XL', 'EXTRA LARGE': 'XL',
    XXL: 'XXL', '2XL': 'XXL', 'XX-LARGE': 'XXL', '3XL': '3XL', XXXL: '3XL', OS: 'One size', 'ONE SIZE': 'One size', 'O/S': 'One size',
  };
  const a = alias[stripped] ?? alias[up];
  if (a) out.push(a);
  if (stripped === 'XXL') out.push('2XL');
  // Waist sizes: W32 or 32" or 32x30.
  const waist = stripped.match(/^W?(\d{2})"?(?:\s*[X/]?\s*L\d{2}|\s*[X/]\s*\d{2})?$/);
  if (waist) out.push(waist[1]!, `${waist[1]}"`);
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------
// Poshmark
// ---------------------------------------------------------------------------

export interface PoshmarkChoice {
  department: 'women' | 'men' | 'kids';
  /** Category names to try, best first. */
  category: string[];
  /** Subcategory names to try, best first; empty leaves it unset. */
  subcategory: string[];
}

export function poshmarkCategory(item: Item): PoshmarkChoice {
  const department = item.department === 'women' || item.department === 'kids' ? item.department : 'men';
  const s = item.subcategory ?? '';
  const c = item.category ?? '';
  const pick = (category: string[], subcategory: string[] = []): PoshmarkChoice => ({ department, category, subcategory });

  if (department === 'kids') {
    if (c === 'tops' || c === 'knitwear') return pick(['Shirts & Tops'], [s === 'hoodies' || s === 'sweatshirts' ? 'Sweatshirts & Hoodies' : 'Tees']);
    if (c === 'bottoms') return pick(['Bottoms'], [s === 'jeans' ? 'Jeans' : s === 'shorts' ? 'Shorts' : s === 'skirts' ? 'Skirts' : 'Pants']);
    if (c === 'outerwear') return pick(['Jackets & Coats']);
    if (c === 'dresses') return pick(['Dresses']);
    if (c === 'shoes') return pick(['Shoes']);
    if (c === 'bags' || c === 'accessories') return pick(['Accessories']);
    return pick(['Other']);
  }

  if (department === 'women') {
    switch (c) {
      case 'tops':
        return pick(['Tops'], {
          't-shirts': ['Tees - Short Sleeve', 'Tees - Long Sleeve'],
          shirts: ['Button Down Shirts'],
          blouses: ['Blouses'],
          'tank-tops': ['Tank Tops', 'Camisoles'],
          polos: ['Tees - Short Sleeve'],
          'crop-tops': ['Crop Tops'],
        }[s] ?? []);
      case 'knitwear':
        if (s === 'hoodies' || s === 'sweatshirts') return pick(['Tops'], ['Sweatshirts & Hoodies']);
        return pick(['Sweaters'], s === 'cardigans' ? ['Cardigans'] : ['Crew & Scoop Necks']);
      case 'outerwear':
        if (s === 'blazers') return pick(['Jackets & Coats'], ['Blazers & Suit Jackets']);
        return pick(['Jackets & Coats'], {
          'denim-jackets': ['Jean Jackets'],
          'leather-jackets': ['Leather Jackets'],
          coats: ['Pea Coats', 'Trench Coats'],
          puffers: ['Puffers'],
          gilets: ['Vests'],
          jackets: ['Utility Jackets', 'Bomber Jackets'],
        }[s] ?? []);
      case 'dresses':
        if (s === 'jumpsuits') return pick(['Pants & Jumpsuits'], ['Jumpsuits & Rompers']);
        return pick(['Dresses'], { 'mini-dresses': ['Mini'], 'midi-dresses': ['Midi'], 'maxi-dresses': ['Maxi'] }[s] ?? []);
      case 'bottoms':
        if (s === 'jeans') return pick(['Jeans']);
        if (s === 'shorts') return pick(['Shorts']);
        if (s === 'skirts') return pick(['Skirts']);
        return pick(['Pants & Jumpsuits'], { joggers: ['Track Pants & Joggers'], leggings: ['Leggings'], trousers: ['Trousers', 'Straight Leg'] }[s] ?? []);
      case 'activewear':
        if (s === 'sports-bottoms' || s === 'tracksuits') return pick(['Pants & Jumpsuits'], ['Track Pants & Joggers', 'Leggings']);
        return pick(['Tops'], ['Tees - Short Sleeve']);
      case 'shoes':
        return pick(['Shoes'], { sneakers: ['Sneakers'], boots: ['Ankle Boots & Booties', 'Combat & Moto Boots'], heels: ['Heels'], flats: ['Flats & Loafers'], sandals: ['Sandals'] }[s] ?? []);
      case 'bags':
        return pick(['Bags'], { handbags: ['Shoulder Bags', 'Satchels'], backpacks: ['Backpacks'], totes: ['Totes'], crossbody: ['Crossbody Bags'] }[s] ?? []);
      case 'accessories':
        if (s === 'jewellery') return pick(['Jewelry']);
        return pick(['Accessories'], { hats: ['Hats'], scarves: ['Scarves & Wraps'], belts: ['Belts'], sunglasses: ['Sunglasses'], watches: ['Watches'] }[s] ?? []);
      default:
        return pick(['Other']);
    }
  }

  switch (c) {
    case 'tops':
      return pick(['Shirts'], {
        't-shirts': ['Tees - Short Sleeve', 'Tees - Long Sleeve'],
        shirts: ['Casual Button Down Shirts', 'Dress Shirts'],
        blouses: ['Casual Button Down Shirts'],
        'tank-tops': ['Tank Tops'],
        polos: ['Polos'],
        'crop-tops': ['Tees - Short Sleeve'],
      }[s] ?? []);
    case 'knitwear':
      if (s === 'hoodies' || s === 'sweatshirts') return pick(['Shirts', 'Sweaters'], ['Sweatshirts & Hoodies']);
      return pick(['Sweaters'], s === 'cardigans' ? ['Cardigan'] : ['Crewneck']);
    case 'outerwear':
      if (s === 'blazers') return pick(['Suits & Blazers'], ['Sport Coats & Blazers']);
      return pick(['Jackets & Coats'], {
        'denim-jackets': ['Lightweight & Shirt Jackets'],
        'leather-jackets': ['Bomber & Varsity', 'Lightweight & Shirt Jackets'],
        coats: ['Pea Coats', 'Trench Coats'],
        puffers: ['Puffers'],
        gilets: ['Vests'],
        jackets: ['Lightweight & Shirt Jackets', 'Bomber & Varsity'],
      }[s] ?? []);
    case 'bottoms':
      if (s === 'jeans') return pick(['Jeans']);
      if (s === 'shorts') return pick(['Shorts']);
      return pick(['Pants'], { joggers: ['Sweatpants & Joggers'], trousers: ['Chinos & Khakis', 'Casual'] }[s] ?? []);
    case 'activewear':
      if (s === 'sports-bottoms' || s === 'tracksuits') return pick(['Pants'], ['Sweatpants & Joggers']);
      return pick(['Shirts'], s === 'jerseys' ? ['Jerseys'] : ['Tees - Short Sleeve']);
    case 'shoes':
      return pick(['Shoes'], { sneakers: ['Sneakers'], boots: ['Boots'], flats: ['Loafers & Slip-Ons'], sandals: ['Sandals & Flip-Flops'] }[s] ?? []);
    case 'bags':
      return pick(['Bags'], { backpacks: ['Backpacks'], totes: ['Totes'], crossbody: ['Messenger Bags'] }[s] ?? []);
    case 'accessories':
      return pick(['Accessories'], { hats: ['Hats'], scarves: ['Scarves'], belts: ['Belts'], jewellery: ['Jewelry'], sunglasses: ['Sunglasses'], watches: ['Watches'] }[s] ?? []);
    case 'dresses':
      return pick(['Other']);
    default:
      return pick(['Other']);
  }
}

const POSH_COLOURS: Record<string, string> = {
  red: 'Red', burgundy: 'Red', maroon: 'Red', wine: 'Red',
  pink: 'Pink',
  orange: 'Orange',
  yellow: 'Yellow', mustard: 'Yellow',
  green: 'Green', olive: 'Green', khaki: 'Green',
  blue: 'Blue', navy: 'Blue', denim: 'Blue',
  purple: 'Purple', lilac: 'Purple',
  gold: 'Gold',
  silver: 'Silver',
  black: 'Black',
  grey: 'Gray', gray: 'Gray', charcoal: 'Gray',
  white: 'White',
  cream: 'Cream', ivory: 'Cream',
  brown: 'Brown', chocolate: 'Brown',
  tan: 'Tan', camel: 'Tan', beige: 'Tan',
};

export function poshmarkColours(item: Item): string[] {
  return mapColours(item.colors, POSH_COLOURS, 2);
}

/** Up to three style tags: the item's own, then its era, then a material. */
export function poshmarkTags(item: Item): string[] {
  const out: string[] = [];
  const add = (t: string | null | undefined) => {
    const v = (t ?? '').trim();
    if (!v || out.length >= 3 || out.some(o => o.toLowerCase() === v.toLowerCase())) return;
    out.push(v.replace(/\b\w/g, ch => ch.toUpperCase()));
  };
  for (const t of item.style_tags) add(t);
  add(item.era);
  for (const m of item.materials) add(m);
  if (!out.length) add(item.category === 'activewear' ? 'Athleisure' : 'Casual');
  return out;
}
