import { CONDITIONS, isCondition } from './conditions.ts';
import { CATEGORIES, matchCategory } from './taxonomy.ts';
import type { Department, ScanResult } from './types.ts';

const CATEGORY_IDS = CATEGORIES.map(c => c.id);
const SUBCATEGORY_IDS = CATEGORIES.flatMap(c => c.subcategories.map(s => s.id));

export const SCAN_SYSTEM_PROMPT = `You are a secondhand clothing expert who writes listings for resale marketplaces such as Depop, Vinted, eBay and Poshmark.

You get one to twelve photos of a single item: usually the front, the back, the brand label, the size tag, the care label and close-ups of any flaws. Read every label you can see. Report only what the photos show or strongly imply; when you cannot tell, use null rather than guessing.

Rules:
- brand: read it from the label or a visible logo. Use null when there is none. Never invent a brand.
- size: copy the size exactly as printed on the tag (for example "M", "UK 10", "W32 L30", "EU 38"). size_system is the system it is written in (US, UK, EU, IT, FR, JP, letter, waist/leg, or null).
- materials: read the care label; give the main fibres, like "100% cotton" or "80% wool, 20% nylon".
- condition: one of new_with_tags, new_without_tags, excellent, good, fair. Use new_with_tags only if a retail tag is visibly attached. Describe every visible flaw in flaws (stains, holes, pilling, fading, missing buttons), or null.
- era: a decade or style era when the label or design makes it clear (for example "90s", "Y2K", "70s"), otherwise null.
- style_tags: two to five words buyers search for, like "streetwear", "grunge", "cottagecore", "workwear", "minimalist".
- title: a natural title a person would type, under 70 characters, without the size.
- description: two or three short sentences in a warm, plain voice about what it is, how it looks and how it fits. No hashtags, no emoji, no measurements, no condition boilerplate.
- price: realistic resale prices in the requested currency for this exact item in this condition, based on what similar items actually sell for secondhand, not retail. suggested sits between low and high.
- measurements_to_take: which flat measurements a buyer would want for this item type, from pit_to_pit, length, shoulder, sleeve, waist, hips, inseam, rise.
- confidence: 0 to 1, how sure you are about the brand and item identification.
- notes: anything the seller should double-check, or null.`;

export function scanUserPrompt(currency: string, hint?: string | null): string {
  const extra = hint && hint.trim() ? `\nThe seller adds: "${hint.trim().slice(0, 300)}"` : '';
  return `Identify this item and draft its listing. Prices in ${currency}.${extra}`;
}

/** JSON Schema for the scan result, in the subset Gemini's structured output accepts. */
export const SCAN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    brand: { type: 'string', nullable: true },
    department: { type: 'string', enum: ['women', 'men', 'kids', 'unisex'], nullable: true },
    category: { type: 'string', enum: CATEGORY_IDS, nullable: true },
    subcategory: { type: 'string', enum: SUBCATEGORY_IDS, nullable: true },
    size: { type: 'string', nullable: true },
    size_system: { type: 'string', nullable: true },
    colors: { type: 'array', items: { type: 'string' } },
    materials: { type: 'array', items: { type: 'string' } },
    condition: { type: 'string', enum: CONDITIONS, nullable: true },
    flaws: { type: 'string', nullable: true },
    era: { type: 'string', nullable: true },
    style_tags: { type: 'array', items: { type: 'string' } },
    description: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
    price: {
      type: 'object',
      properties: {
        low: { type: 'number' },
        high: { type: 'number' },
        suggested: { type: 'number' },
      },
      required: ['low', 'high', 'suggested'],
    },
    measurements_to_take: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
    notes: { type: 'string', nullable: true },
  },
  required: [
    'title',
    'brand',
    'department',
    'category',
    'subcategory',
    'size',
    'colors',
    'materials',
    'condition',
    'flaws',
    'style_tags',
    'description',
    'keywords',
    'price',
    'measurements_to_take',
    'confidence',
  ],
} as const;

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const strList = (v: unknown, max = 12): string[] =>
  Array.isArray(v) ? v.map(str).filter((x): x is string => Boolean(x)).slice(0, max) : [];
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v) : Number.NaN;
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/**
 * Coerce whatever the model returned into a valid ScanResult. Models drift:
 * wrong enum spellings, a category given as free text, prices as strings.
 */
export function normalizeScan(raw: unknown, currency: string): ScanResult {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const department = str(r.department)?.toLowerCase() as Department | undefined;
  let category = str(r.category)?.toLowerCase() ?? null;
  let subcategory = str(r.subcategory)?.toLowerCase() ?? null;
  if (!category || !CATEGORY_IDS.includes(category) || (subcategory && !SUBCATEGORY_IDS.includes(subcategory))) {
    const guess = matchCategory([subcategory, category, str(r.title)].filter(Boolean).join(' '));
    category = guess?.category ?? (category && CATEGORY_IDS.includes(category) ? category : null);
    subcategory = guess?.subcategory ?? null;
  }

  const conditionRaw = str(r.condition)?.toLowerCase().replace(/[\s-]+/g, '_');
  const priceObj = (r.price && typeof r.price === 'object' ? r.price : {}) as Record<string, unknown>;
  let low = num(priceObj.low);
  let high = num(priceObj.high);
  let suggested = num(priceObj.suggested);
  if (low > high) [low, high] = [high, low];
  if (!suggested && (low || high)) suggested = (low + high) / 2;
  if (suggested && !low) low = suggested * 0.8;
  if (suggested && !high) high = suggested * 1.2;
  suggested = Math.min(Math.max(suggested, low), high || suggested);

  const brand = str(r.brand);
  const confidence = num(r.confidence);

  return {
    title: str(r.title)?.slice(0, 120) ?? 'Untitled item',
    brand: brand && !/^(unknown|unbranded|none|n\/a)$/i.test(brand) ? brand : null,
    department: department && ['women', 'men', 'kids', 'unisex'].includes(department) ? department : null,
    category,
    subcategory,
    size: str(r.size),
    size_system: str(r.size_system),
    colors: strList(r.colors, 4).map(c => c.toLowerCase()),
    materials: strList(r.materials, 4),
    condition: isCondition(conditionRaw) ? conditionRaw : null,
    flaws: str(r.flaws),
    era: str(r.era),
    style_tags: strList(r.style_tags, 5).map(t => t.toLowerCase()),
    description: str(r.description) ?? '',
    keywords: strList(r.keywords, 15).map(k => k.toLowerCase()),
    price: {
      low: Math.round(low),
      high: Math.round(high),
      suggested: Math.round(suggested),
      currency,
    },
    measurements_to_take: strList(r.measurements_to_take, 8),
    confidence: Math.min(1, confidence > 1 ? confidence / 100 : confidence),
    notes: str(r.notes),
  };
}
