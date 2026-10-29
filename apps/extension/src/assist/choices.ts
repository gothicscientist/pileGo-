// What to pick in the sell forms' dropdowns for a pileGo item. Pure
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

export function conditionWords(market: 'depop' | 'poshmark' | 'mercari' | 'grailed', item: Item): string[] {
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

/**
 * Depop package sizes go by weight: Small and Medium under 1lb, Large under
 * 2lb, Extra large under 10lb. Only used when Depop has not suggested one.
 */
export function depopPackage(item: Item): string[] {
  const sub = item.subcategory ?? '';
  const cat = item.category ?? '';
  if (['coats', 'puffers', 'leather-jackets'].includes(sub) || ['shoes', 'bags'].includes(cat)) return ['Extra large', 'Large'];
  if (['outerwear', 'knitwear', 'bottoms'].includes(cat) || ['hoodies', 'sweatshirts', 'tracksuits'].includes(sub)) {
    return ['shorts', 'skirts', 'leggings'].includes(sub) ? ['Medium', 'Large'] : ['Large', 'Medium'];
  }
  if (['t-shirts', 'tank-tops', 'crop-tops', 'polos'].includes(sub) || cat === 'accessories') return ['Small', 'Medium'];
  return ['Medium', 'Large'];
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

/**
 * Ways a size option on a list may be labelled, for matching against
 * sizeWants: "M (38-40)" is also "M", "US M / EU 48-50 / 2" is also "M".
 */
export function sizeLabels(label: string): string[] {
  const out = [label.trim()];
  const first = label.split('/')[0]!.trim();
  for (const s of [label, first]) {
    const bare = s.replace(/\s*\(.*\)\s*$/, '').trim();
    out.push(bare, bare.replace(/^US\s+/i, '').replace(/\s+in\.?$/i, '').trim());
  }
  return [...new Set(out.filter(Boolean))];
}

/** The option for a size, best match first; options earlier in the list win ties. */
export function pickSize<T>(options: T[], label: (o: T) => string, size: string | null | undefined): T | null {
  const wants = sizeWants(size).map(w => w.toLowerCase().replace(/\s+/g, ' '));
  if (!wants.length) return null;
  const keyed = options.map(o => ({ o, names: sizeLabels(label(o)).map(n => n.toLowerCase().replace(/\s+/g, ' ')) }));
  for (const want of wants) {
    const hit = keyed.find(k => k.names.includes(want));
    if (hit) return hit.o;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Mercari
// ---------------------------------------------------------------------------

/**
 * Where an item goes in Mercari's category tree: the department row, then
 * the category, then the subcategory, each with fallbacks best first. An
 * empty subcategory list picks Mercari's "All <category>" row. Names were
 * read off the live picker (October 2026).
 */
export interface MercariChoice {
  department: 'Women' | 'Men' | 'Kids';
  category: string[];
  subcategory: string[];
}

export function mercariCategory(item: Item): MercariChoice {
  const s = item.subcategory ?? '';
  const c = item.category ?? '';

  if (item.department === 'kids') {
    const girly = ['dresses', 'skirts'].includes(c) || ['skirts', 'mini-dresses', 'midi-dresses', 'maxi-dresses', 'heels'].includes(s);
    const g = girly ? 'Girls' : 'Boys';
    const cat =
      c === 'outerwear' ? 'coats & jackets'
      : c === 'bottoms' ? 'bottoms'
      : c === 'dresses' ? (girly ? 'dresses' : 'other')
      : c === 'shoes' ? 'shoes'
      : c === 'bags' || c === 'accessories' ? 'accessories'
      : c === 'tops' || c === 'knitwear' || c === 'activewear' ? 'tops & t-shirts'
      : 'other';
    return { department: 'Kids', category: [`${g} ${cat}`], subcategory: [`${g} (4+)`] };
  }

  const pick = (category: string[], subcategory: string[] = []) => ({ category, subcategory });

  if (item.department === 'women') {
    const choice = ((): Omit<MercariChoice, 'department'> => {
      switch (c) {
        case 'tops':
          return pick(['Tops & blouses'], {
            't-shirts': ['T-shirts'],
            shirts: ['Button down shirt'],
            blouses: ['Blouse'],
            'tank-tops': ['Tank Tops', 'Camisoles'],
            polos: ['Polo shirt'],
            'crop-tops': ['Knit top', 'T-shirts'],
          }[s] ?? ['Other']);
        case 'knitwear':
          if (s === 'hoodies') return pick(['Sweaters'], ['Hooded']);
          if (s === 'sweatshirts') return pick(['Athletic apparel'], ['Athletic Sweatshirts']);
          if (s === 'cardigans') return pick(['Sweaters'], ['Cardigan']);
          return pick(['Sweaters'], ['Crewneck', 'Other']);
        case 'outerwear':
          if (s === 'blazers') return pick(['Suits & blazers'], ['Blazer']);
          return pick(['Coats & jackets'], {
            'denim-jackets': ['Jean jacket'],
            'leather-jackets': ['Motorcycle', 'Other'],
            coats: ['Wool', 'Trench', 'Peacoat'],
            puffers: ['Puffer'],
            gilets: ['Vest'],
            jackets: ['Windbreaker', 'Other'],
          }[s] ?? ['Other']);
        case 'dresses':
          return pick(['Dresses'], {
            'mini-dresses': ['Above knee, mini'],
            'midi-dresses': ['Midi'],
            'maxi-dresses': ['Maxi'],
            jumpsuits: ['Jumpsuits & Rompers'],
          }[s] ?? ['Other']);
        case 'bottoms':
          if (s === 'jeans') return pick(['Jeans'], ['Other']);
          if (s === 'shorts') return pick(['Shorts'], ['Other']);
          if (s === 'skirts') return pick(['Skirts'], ['Other']);
          if (s === 'leggings') return pick(['Athletic apparel'], ['Athletic Leggings']);
          if (s === 'joggers') return pick(['Athletic apparel'], ['Athletic Sweat Pants', 'Track Pants']);
          return pick(['Pants'], ['Casual pants', 'Other']);
        case 'activewear':
          return pick(['Athletic apparel'], {
            'sports-tops': ['Athletic T-Shirts'],
            'sports-bottoms': ['Athletic Leggings', 'Athletic Pants'],
            tracksuits: ['Tracksuits'],
            jerseys: ['Jerseys'],
          }[s] ?? ['Other']);
        case 'shoes':
          return pick(['Shoes'], {
            sneakers: ['Fashion sneakers'],
            boots: ['Boots'],
            heels: ['Heels'],
            flats: ['Flats', 'Loafers'],
            sandals: ['Sandals'],
          }[s] ?? ['Other']);
        case 'bags':
          return pick(["Women's handbags"], {
            handbags: ['Shoulder Bags', 'Satchel'],
            backpacks: ['Backpacks'],
            totes: ['Tote Bags'],
            crossbody: ['Crossbody Bags'],
          }[s] ?? ['Other']);
        case 'accessories':
          if (s === 'jewellery') return pick(['Jewelry'], ['Necklaces']);
          return pick(["Women's accessories"], {
            hats: ['Hats'],
            scarves: ['Scarves'],
            belts: ['Belts'],
            sunglasses: ['Sunglasses'],
            watches: ['Watches'],
          }[s] ?? ['Other']);
        default:
          return pick(['Other']);
      }
    })();
    return { department: 'Women', ...choice };
  }

  const choice = ((): Omit<MercariChoice, 'department'> => {
    switch (c) {
      case 'tops':
        return pick(['Tops'], {
          't-shirts': ['T-shirts'],
          shirts: ['Button-front'],
          blouses: ['Button-front'],
          'tank-tops': ['Tank'],
          polos: ['Polos'],
          'crop-tops': ['T-shirts'],
        }[s] ?? ['Other']);
      case 'knitwear':
        if (s === 'hoodies') return pick(['Sweats & hoodies'], ['Hoodie']);
        if (s === 'sweatshirts') return pick(['Sweats & hoodies'], ['Sweatshirt, pullover']);
        if (s === 'cardigans') return pick(['Sweaters'], ['Cardigan']);
        return pick(['Sweaters'], ['Crewneck', 'Other']);
      case 'outerwear':
        if (s === 'blazers') return pick(['Blazers & sport coats'], ['Other']);
        return pick(['Coats & jackets'], {
          'denim-jackets': ['Jean jacket'],
          'leather-jackets': ['Motorcycle', 'Other'],
          coats: ['Wool', 'Trench', 'Peacoat'],
          puffers: ['Puffer'],
          gilets: ['Vest'],
          jackets: ['Flight/bomber', 'Windbreaker', 'Other'],
        }[s] ?? ['Other']);
      case 'bottoms':
        if (s === 'jeans') return pick(['Jeans'], ['Other']);
        if (s === 'shorts') return pick(['Shorts'], ['Casual shorts', 'Other']);
        if (s === 'joggers') return pick(['Sweats & hoodies'], ['Sweat Pants']);
        return pick(['Pants'], ['Casual pants', 'Other']);
      case 'activewear':
        return pick(['Athletic apparel'], {
          'sports-tops': ['Athletic T-Shirts'],
          'sports-bottoms': ['Athletic Sweat Pants', 'Pants'],
          tracksuits: ['Tracksuits'],
          jerseys: ['Jerseys'],
        }[s] ?? ['Other']);
      case 'shoes':
        return pick(['Shoes'], {
          sneakers: ['Fashion sneakers'],
          boots: ['Boots'],
          flats: ['Loafers', 'Slip-Ons'],
          sandals: ['Sandals'],
        }[s] ?? []);
      case 'bags':
        return pick(["Men's accessories"], { backpacks: ['Backpacks'] }[s] ?? ['Bags']);
      case 'accessories':
        if (s === 'jewellery') return pick(['Jewelry'], ['Necklaces']);
        return pick(["Men's accessories"], {
          hats: ['Hats'],
          scarves: ['Scarves'],
          belts: ['Belts'],
          sunglasses: ['Sunglasses'],
          watches: ['Watches'],
        }[s] ?? ['Other']);
      case 'dresses':
      default:
        return pick(['Other']);
    }
  })();
  return { department: 'Men', ...choice };
}

// ---------------------------------------------------------------------------
// Grailed
// ---------------------------------------------------------------------------

export interface GrailedChoice {
  department: 'Menswear' | 'Womenswear';
  category: string[];
  subcategory: string[];
}

/** Grailed's department, category and subcategory, read off the live form (October 2026). */
export function grailedCategory(item: Item): GrailedChoice {
  const s = item.subcategory ?? '';
  const c = item.category ?? '';
  const pick = (category: string[], subcategory: string[]) => ({ category, subcategory });

  if (item.department === 'women') {
    const choice = ((): Omit<GrailedChoice, 'department'> => {
      switch (c) {
        case 'tops':
          return pick(['Tops'], {
            't-shirts': ['Short Sleeve T-Shirts'],
            shirts: ['Button Ups'],
            blouses: ['Blouses'],
            'tank-tops': ['Tank Tops'],
            polos: ['Polos'],
            'crop-tops': ['Crop Tops'],
          }[s] ?? ['Short Sleeve T-Shirts']);
        case 'knitwear':
          return pick(['Tops'], { hoodies: ['Hoodies'], sweatshirts: ['Sweatshirts'] }[s] ?? ['Sweaters']);
        case 'outerwear':
          return pick(['Outerwear'], {
            blazers: ['Blazers'],
            'denim-jackets': ['Denim Jackets'],
            'leather-jackets': ['Leather Jackets'],
            coats: ['Coats'],
            puffers: ['Down Jackets'],
            gilets: ['Vests'],
            jackets: ['Jackets', 'Bombers'],
          }[s] ?? ['Jackets']);
        case 'dresses':
          if (s === 'jumpsuits') return pick(['Bottoms'], ['Jumpsuits']);
          return pick(['Dresses'], { 'mini-dresses': ['Mini Dresses'], 'midi-dresses': ['Midi Dresses'], 'maxi-dresses': ['Maxi Dresses'] }[s] ?? ['Midi Dresses']);
        case 'bottoms':
          return pick(['Bottoms'], {
            jeans: ['Jeans'],
            shorts: ['Shorts'],
            skirts: ['Mini Skirts', 'Midi Skirts'],
            joggers: ['Joggers', 'Sweatpants'],
            leggings: ['Leggings'],
          }[s] ?? ['Pants']);
        case 'activewear':
          if (s === 'sports-bottoms') return pick(['Bottoms'], ['Leggings', 'Sweatpants']);
          if (s === 'tracksuits') return pick(['Bottoms'], ['Sweatpants']);
          return pick(['Tops'], ['Short Sleeve T-Shirts']);
        case 'shoes':
          return pick(['Footwear'], { sneakers: ['Low-Top Sneakers'], boots: ['Boots'], heels: ['Heels'], flats: ['Flats'], sandals: ['Sandals'] }[s] ?? ['Flats']);
        case 'bags':
          return pick(['Bags & Luggage'], { handbags: ['Shoulder Bags', 'Handle Bags'], backpacks: ['Backpacks'], totes: ['Tote Bags'], crossbody: ['Crossbody Bags'] }[s] ?? ['Other']);
        case 'accessories':
          if (s === 'jewellery') return pick(['Jewelry'], ['Necklaces', 'Other']);
          return pick(['Accessories'], { hats: ['Hats'], scarves: ['Scarves'], belts: ['Belts'], sunglasses: ['Sunglasses'], watches: ['Watches'] }[s] ?? ['Miscellaneous']);
        default:
          return pick(['Tops'], ['Short Sleeve T-Shirts']);
      }
    })();
    return { department: 'Womenswear', ...choice };
  }

  const choice = ((): Omit<GrailedChoice, 'department'> => {
    switch (c) {
      case 'tops':
        return pick(['Tops'], {
          't-shirts': ['Short Sleeve T-Shirts', 'Long Sleeve T-Shirts'],
          shirts: ['Shirts (Button Ups)'],
          blouses: ['Shirts (Button Ups)'],
          'tank-tops': ['Tank Tops & Sleeveless'],
          polos: ['Polos'],
          'crop-tops': ['Short Sleeve T-Shirts'],
        }[s] ?? ['Short Sleeve T-Shirts']);
      case 'knitwear':
        return pick(['Tops'], s === 'hoodies' || s === 'sweatshirts' ? ['Sweatshirts & Hoodies'] : ['Sweaters & Knitwear']);
      case 'outerwear':
        if (s === 'blazers') return pick(['Tailoring'], ['Blazers']);
        return pick(['Outerwear'], {
          'denim-jackets': ['Denim Jackets'],
          'leather-jackets': ['Leather Jackets'],
          coats: ['Heavy Coats'],
          puffers: ['Parkas', 'Heavy Coats'],
          gilets: ['Vests'],
          jackets: ['Light Jackets', 'Bombers'],
        }[s] ?? ['Light Jackets']);
      case 'bottoms':
        return pick(['Bottoms'], { jeans: ['Denim'], shorts: ['Shorts'], joggers: ['Sweatpants & Joggers'], leggings: ['Leggings'] }[s] ?? ['Casual Pants']);
      case 'activewear':
        if (s === 'sports-bottoms' || s === 'tracksuits') return pick(['Bottoms'], ['Sweatpants & Joggers']);
        if (s === 'jerseys') return pick(['Tops'], ['Jerseys']);
        return pick(['Tops'], ['Short Sleeve T-Shirts']);
      case 'shoes':
        return pick(['Footwear'], { sneakers: ['Low-Top Sneakers', 'Hi-Top Sneakers'], boots: ['Boots'], flats: ['Casual Leather Shoes'], sandals: ['Sandals'] }[s] ?? ['Casual Leather Shoes']);
      case 'bags':
        return pick(['Accessories'], ['Bags & Luggage']);
      case 'accessories':
        return pick(['Accessories'], {
          hats: ['Hats'],
          scarves: ['Gloves & Scarves'],
          belts: ['Belts'],
          jewellery: ['Jewelry & Watches'],
          watches: ['Jewelry & Watches'],
          sunglasses: ['Sunglasses'],
        }[s] ?? ['Miscellaneous']);
      case 'dresses':
        return pick(['Tops'], ['Short Sleeve T-Shirts']);
      default:
        return pick(['Tops'], ['Short Sleeve T-Shirts']);
    }
  })();
  return { department: 'Menswear', ...choice };
}

const GRAILED_COLOURS: Record<string, string> = {
  black: 'Black', charcoal: 'Gray',
  white: 'White', ivory: 'Beige', cream: 'Beige',
  grey: 'Gray', gray: 'Gray',
  brown: 'Brown', chocolate: 'Brown', tan: 'Brown', camel: 'Brown',
  beige: 'Beige', khaki: 'Beige',
  yellow: 'Yellow', mustard: 'Yellow',
  red: 'Red', burgundy: 'Red', maroon: 'Red', wine: 'Red',
  orange: 'Orange',
  pink: 'Pink',
  purple: 'Purple', lilac: 'Purple',
  blue: 'Blue', navy: 'Blue', denim: 'Blue',
  green: 'Green', olive: 'Green',
  multi: 'Multi', multicolour: 'Multi', multicolor: 'Multi',
  silver: 'Silver',
  gold: 'Gold',
};

/** Grailed takes one colour; several distinct ones make Multi. */
export function grailedColour(item: Item): string | null {
  const all = mapColours(item.colors, GRAILED_COLOURS, 3);
  if (!all.length) return null;
  return all.length > 2 ? 'Multi' : all[0]!;
}

const GRAILED_STYLES = ['Luxury', 'Vintage', 'Avant-Garde', 'Streetwear', 'Workwear', 'Gorpcore', 'Sportswear', 'Basics', 'Western'];

/** Grailed's one style, from the item's tags and era; null leaves it unset. */
export function grailedStyle(item: Item): string | null {
  const synonyms: Record<string, string> = {
    avantgarde: 'Avant-Garde', designer: 'Luxury', utility: 'Workwear', outdoor: 'Gorpcore', athletic: 'Sportswear',
    athleisure: 'Sportswear', sporty: 'Sportswear', minimal: 'Basics', minimalist: 'Basics', skate: 'Streetwear', skater: 'Streetwear',
  };
  for (const tag of item.style_tags) {
    const t = lower(tag).replace(/[^a-z]/g, '');
    const hit = GRAILED_STYLES.find(s => s.toLowerCase().replace(/[^a-z]/g, '') === t) ?? synonyms[t];
    if (hit) return hit;
  }
  return isVintage(item) ? 'Vintage' : null;
}
