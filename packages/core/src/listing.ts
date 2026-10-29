import { CONDITION_LABEL } from './conditions.ts';
import { MARKETPLACES } from './marketplaces.ts';
import { priceOn, type PriceStrategy } from './pricing.ts';
import { categoryPath, findSubcategory } from './taxonomy.ts';
import { clampParagraphs, clampWords, stripWords, titleCase, toHashtag, uniqueBy } from './text.ts';
import type { Item, MarketplaceId, Measurements, Profile, SellerVoice } from './types.ts';

export interface GeneratedListing {
  marketplace: MarketplaceId;
  title: string;
  description: string;
  hashtags: string[];
  price: number | null;
  currency: string;
  condition_label: string | null;
  category_path: string;
  /** Plain field values a sell form asks for, in the order forms usually ask. */
  fields: Array<{ key: string; label: string; value: string }>;
  warnings: string[];
}

export const DEFAULT_VOICE: SellerVoice = {
  tone: 'friendly',
  sign_off: null,
  always_mention: [],
  avoid_words: [],
};

export interface GenerateOptions {
  voice?: SellerVoice;
  region?: Profile['region'];
  strategy?: PriceStrategy;
  fee_overrides?: Profile['fee_overrides'];
}

const MEASURE_LABEL: Record<Exclude<keyof Measurements, 'unit'>, string> = {
  pit_to_pit: 'Pit to pit',
  length: 'Length',
  shoulder: 'Shoulder',
  sleeve: 'Sleeve',
  waist: 'Waist',
  hips: 'Hips',
  inseam: 'Inseam',
  rise: 'Rise',
};

export function measurementLines(m: Measurements | null | undefined): string[] {
  if (!m) return [];
  const lines: string[] = [];
  for (const key of Object.keys(MEASURE_LABEL) as Array<keyof typeof MEASURE_LABEL>) {
    const value = m[key];
    if (value != null && value > 0) lines.push(`${MEASURE_LABEL[key]}: ${trimNumber(value)} ${m.unit}`);
  }
  return lines;
}

function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Keyword title in the order buyers search: brand, era, style, type, colour, material, size. */
export function buildTitle(item: Item, max: number): string {
  if (max <= 0) return '';
  const sub = findSubcategory(item.category, item.subcategory);
  const typeWord = sub?.label.replace(/s$/, '') ?? '';
  const typeKnown = typeWord && typeWord.split(' ').some(w => includesWord(item.title, w.replace(/s$/, '')));
  // Priority order: what buyers filter and search by first.
  const pieces = [
    item.brand && item.brand.toLowerCase() !== 'unbranded' ? item.brand : null,
    item.size ? `Size ${item.size}` : null,
    item.department === 'women' ? "Women's" : item.department === 'men' ? "Men's" : null,
    item.era,
    typeWord && !typeKnown ? typeWord : null,
    item.colors[0] ?? null,
    item.materials[0]?.replace(/^100%\s*/, '') ?? null,
    ...item.style_tags.slice(0, 2),
  ].filter((p): p is string => Boolean(p && p.trim()));

  // The seller's own title wins when it already reads well and fits.
  const own = item.title.trim();
  if (own && own.length <= max && own.split(' ').length >= 3) {
    const extra = pieces.filter(p => !includesWord(own, p));
    let title = own;
    for (const p of extra) {
      if ((title + ' ' + p).length > max) continue;
      title += ' ' + p;
    }
    return title;
  }
  const words = uniqueBy([own, ...pieces].filter(Boolean), p => p.toLowerCase());
  return clampWords(titleCase(words.join(' ')), max);
}

function includesWord(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function buildHashtags(item: Item, max: number): string[] {
  if (max <= 0) return [];
  const sub = findSubcategory(item.category, item.subcategory);
  const candidates = [
    ...item.style_tags,
    item.era,
    item.brand && item.brand.toLowerCase() !== 'unbranded' ? item.brand : null,
    sub?.label ?? null,
    item.colors[0] ? `${item.colors[0]} ${sub?.label ?? ''}` : null,
  ];
  const tags = candidates
    .filter((c): c is string => Boolean(c))
    .map(toHashtag)
    .filter((t): t is string => Boolean(t));
  return uniqueBy(tags, t => t).slice(0, max);
}

function detailLines(item: Item, style: 'bullets' | 'plain'): string[] {
  const lines: string[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value && value.trim()) lines.push(style === 'bullets' ? `• ${label}: ${value}` : `${label}: ${value}`);
  };
  add('Brand', item.brand);
  add('Size', item.size ? `${item.size}${item.size_system ? ` (${item.size_system})` : ''}` : null);
  add('Colour', item.colors.join(', '));
  add('Material', item.materials.join(', '));
  add('Era', item.era);
  add('Condition', item.condition ? CONDITION_LABEL[item.condition] : null);
  if (item.flaws) add('Flaws', item.flaws);
  for (const m of measurementLines(item.measurements)) {
    lines.push(style === 'bullets' ? `• ${m}` : m);
  }
  return lines;
}

function closingLines(voice: SellerVoice, marketplace: MarketplaceId): string[] {
  const lines = [...voice.always_mention.filter(Boolean)];
  if (voice.sign_off) lines.push(voice.sign_off);
  else if (voice.tone === 'friendly' && marketplace !== 'ebay') lines.push('Questions or offers welcome.');
  return lines;
}

/** Turn one closet item into the listing a specific marketplace expects. */
export function generateListing(
  item: Item,
  marketplace: MarketplaceId,
  options: GenerateOptions = {},
): GeneratedListing {
  const info = MARKETPLACES[marketplace];
  const voice = options.voice ?? DEFAULT_VOICE;
  const warnings: string[] = [];

  const title = buildTitle(item, info.title_max);
  const hashtags = buildHashtags(item, info.hashtags_max);
  const intro = item.description.trim();

  let description: string;
  switch (marketplace) {
    case 'depop': {
      // Depop has no title field: the first line of the description is the title.
      const lead = buildTitle(item, 60);
      const parts = [lead, intro, detailLines(item, 'plain').join('\n'), closingLines(voice, marketplace).join('\n'), hashtags.join(' ')];
      description = parts.filter(Boolean).join('\n\n');
      break;
    }
    case 'grailed': {
      const parts = [intro, detailLines(item, 'plain').join('\n'), closingLines(voice, marketplace).join('\n')];
      description = parts.filter(Boolean).join('\n\n');
      break;
    }
    case 'ebay': {
      const parts = [intro, detailLines(item, 'bullets').join('\n'), closingLines(voice, marketplace).join('\n')];
      description = parts.filter(Boolean).join('\n\n');
      break;
    }
    default: {
      const parts = [intro, detailLines(item, 'bullets').join('\n'), closingLines(voice, marketplace).join('\n')];
      description = parts.filter(Boolean).join('\n\n');
    }
  }

  description = stripWords(description, voice.avoid_words);
  if (info.description_max > 0 && description.length > info.description_max) {
    warnings.push(`Description shortened to ${info.description_max} characters for ${info.name}.`);
    description = clampParagraphs(description, info.description_max);
  }

  const price =
    item.price != null
      ? priceOn(item.price, marketplace, options.region ?? 'US', options.strategy ?? 'same', options.fee_overrides)
      : null;

  if (!item.price) warnings.push('Add a price before listing.');
  if (!item.condition) warnings.push('Pick a condition before listing.');
  if (!item.size && item.category !== 'bags' && item.category !== 'accessories') {
    warnings.push('Most buyers filter by size; add one if the item has a label.');
  }
  if ((item.photos?.length ?? 0) === 0) warnings.push('Add at least one photo.');
  if ((item.photos?.length ?? 0) > info.photos_max) {
    warnings.push(`${info.name} takes ${info.photos_max} photos; the first ${info.photos_max} will be used.`);
  }

  const fields: GeneratedListing['fields'] = [];
  const field = (key: string, label: string, value: string | null | undefined) => {
    if (value) fields.push({ key, label, value });
  };
  if (title) field('title', 'Title', title);
  field('price', 'Price', price != null ? String(price) : null);
  field('brand', 'Brand', item.brand);
  field('category', 'Category', categoryPath(item.department, item.category, item.subcategory));
  field('size', 'Size', item.size);
  field('condition', 'Condition', item.condition ? CONDITION_LABEL[item.condition] : null);
  field('color', 'Colour', item.colors.join(', '));
  field('material', 'Material', item.materials.join(', '));
  if (item.original_price) field('original_price', 'Original price', String(item.original_price));

  return {
    marketplace,
    title,
    description,
    hashtags,
    price,
    currency: item.currency,
    condition_label: item.condition ? CONDITION_LABEL[item.condition] : null,
    category_path: categoryPath(item.department, item.category, item.subcategory),
    fields,
    warnings,
  };
}

/** Plain text a seller can paste anywhere: the manual listing kit. */
export function listingKitText(listing: GeneratedListing): string {
  const head = listing.title ? `${listing.title}\n\n` : '';
  const price = listing.price != null ? `\n\nPrice: ${listing.price} ${listing.currency}` : '';
  return `${head}${listing.description}${price}`;
}
