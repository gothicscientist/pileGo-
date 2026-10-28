import type { Department } from './types.ts';

export interface Subcategory {
  id: string;
  label: string;
  /** Words used to find the matching category on a marketplace. */
  search: string[];
}

export interface Category {
  id: string;
  label: string;
  subcategories: Subcategory[];
}

const sub = (id: string, label: string, ...search: string[]): Subcategory => ({
  id,
  label,
  search: search.length ? search : [label],
});

export const CATEGORIES: Category[] = [
  {
    id: 'tops',
    label: 'Tops',
    subcategories: [
      sub('t-shirts', 'T-shirts', 'T-shirts', 'Tees'),
      sub('shirts', 'Shirts', 'Shirts', 'Button-up'),
      sub('blouses', 'Blouses', 'Blouses'),
      sub('tank-tops', 'Tank tops', 'Tank tops', 'Vests', 'Camisoles'),
      sub('polos', 'Polos', 'Polo shirts', 'Polos'),
      sub('crop-tops', 'Crop tops', 'Crop tops'),
    ],
  },
  {
    id: 'knitwear',
    label: 'Knitwear and sweats',
    subcategories: [
      sub('sweaters', 'Sweaters', 'Jumpers', 'Sweaters'),
      sub('cardigans', 'Cardigans', 'Cardigans'),
      sub('hoodies', 'Hoodies', 'Hoodies', 'Hooded sweatshirts'),
      sub('sweatshirts', 'Sweatshirts', 'Sweatshirts'),
    ],
  },
  {
    id: 'outerwear',
    label: 'Coats and jackets',
    subcategories: [
      sub('jackets', 'Jackets', 'Jackets'),
      sub('denim-jackets', 'Denim jackets', 'Denim jackets'),
      sub('leather-jackets', 'Leather jackets', 'Leather jackets'),
      sub('coats', 'Coats', 'Coats'),
      sub('puffers', 'Puffer jackets', 'Puffer jackets', 'Down jackets'),
      sub('blazers', 'Blazers', 'Blazers', 'Suit jackets'),
      sub('gilets', 'Gilets and vests', 'Gilets', 'Body warmers', 'Vests'),
    ],
  },
  {
    id: 'dresses',
    label: 'Dresses and jumpsuits',
    subcategories: [
      sub('mini-dresses', 'Mini dresses', 'Mini dresses', 'Dresses'),
      sub('midi-dresses', 'Midi dresses', 'Midi dresses', 'Dresses'),
      sub('maxi-dresses', 'Maxi dresses', 'Maxi dresses', 'Dresses'),
      sub('jumpsuits', 'Jumpsuits', 'Jumpsuits', 'Playsuits', 'Rompers'),
    ],
  },
  {
    id: 'bottoms',
    label: 'Bottoms',
    subcategories: [
      sub('jeans', 'Jeans', 'Jeans'),
      sub('trousers', 'Trousers', 'Trousers', 'Pants'),
      sub('shorts', 'Shorts', 'Shorts'),
      sub('skirts', 'Skirts', 'Skirts'),
      sub('joggers', 'Joggers', 'Joggers', 'Sweatpants', 'Tracksuit bottoms'),
      sub('leggings', 'Leggings', 'Leggings'),
    ],
  },
  {
    id: 'activewear',
    label: 'Activewear',
    subcategories: [
      sub('sports-tops', 'Sports tops', 'Sports tops', 'Activewear'),
      sub('sports-bottoms', 'Sports bottoms', 'Sports bottoms', 'Activewear'),
      sub('tracksuits', 'Tracksuits', 'Tracksuits'),
      sub('jerseys', 'Jerseys', 'Football shirts', 'Jerseys'),
    ],
  },
  {
    id: 'shoes',
    label: 'Shoes',
    subcategories: [
      sub('sneakers', 'Sneakers', 'Trainers', 'Sneakers'),
      sub('boots', 'Boots', 'Boots'),
      sub('heels', 'Heels', 'Heels', 'Pumps'),
      sub('flats', 'Flats', 'Flats', 'Loafers', 'Ballet flats'),
      sub('sandals', 'Sandals', 'Sandals', 'Slides'),
    ],
  },
  {
    id: 'bags',
    label: 'Bags',
    subcategories: [
      sub('handbags', 'Handbags', 'Handbags', 'Shoulder bags'),
      sub('backpacks', 'Backpacks', 'Backpacks'),
      sub('totes', 'Tote bags', 'Tote bags'),
      sub('crossbody', 'Crossbody bags', 'Crossbody bags'),
    ],
  },
  {
    id: 'accessories',
    label: 'Accessories',
    subcategories: [
      sub('hats', 'Hats and caps', 'Hats', 'Caps', 'Beanies'),
      sub('scarves', 'Scarves', 'Scarves'),
      sub('belts', 'Belts', 'Belts'),
      sub('jewellery', 'Jewellery', 'Jewellery', 'Jewelry'),
      sub('sunglasses', 'Sunglasses', 'Sunglasses'),
      sub('watches', 'Watches', 'Watches'),
    ],
  },
  {
    id: 'other',
    label: 'Other',
    subcategories: [sub('other', 'Other', 'Other')],
  },
];

export const DEPARTMENTS: Array<{ id: Department; label: string }> = [
  { id: 'women', label: 'Women' },
  { id: 'men', label: 'Men' },
  { id: 'unisex', label: 'Unisex' },
  { id: 'kids', label: 'Kids' },
];

export function findCategory(id: string | null | undefined): Category | undefined {
  return CATEGORIES.find(c => c.id === id);
}

export function findSubcategory(
  categoryId: string | null | undefined,
  subId: string | null | undefined,
): Subcategory | undefined {
  return findCategory(categoryId)?.subcategories.find(s => s.id === subId);
}

/** A readable path like "Women › Coats and jackets › Denim jackets". */
export function categoryPath(
  department: Department | null,
  categoryId: string | null,
  subId: string | null,
): string {
  const parts: string[] = [];
  const dep = DEPARTMENTS.find(d => d.id === department);
  if (dep) parts.push(dep.label);
  const cat = findCategory(categoryId);
  if (cat) parts.push(cat.label);
  const s = findSubcategory(categoryId, subId);
  if (s && s.label !== cat?.label) parts.push(s.label);
  return parts.join(' › ');
}

/** Map a free-text guess (from the AI or an import) to our ids. */
export function matchCategory(text: string | null | undefined): { category: string; subcategory: string } | null {
  if (!text) return null;
  const needle = text.toLowerCase();
  let best: { category: string; subcategory: string; score: number } | null = null;
  for (const cat of CATEGORIES) {
    for (const s of cat.subcategories) {
      for (const word of [s.label, ...s.search]) {
        const w = word.toLowerCase();
        const singular = w.endsWith('s') ? w.slice(0, -1) : w;
        if (needle.includes(w) || needle.includes(singular)) {
          const score = w.length;
          if (!best || score > best.score) best = { category: cat.id, subcategory: s.id, score };
        }
      }
    }
  }
  return best ? { category: best.category, subcategory: best.subcategory } : null;
}
