// Generated from packages/core/src by scripts/sync-core.mjs. Do not edit.
import type { Condition, MarketplaceId } from './types.ts';

export const CONDITIONS: Condition[] = [
  'new_with_tags',
  'new_without_tags',
  'excellent',
  'good',
  'fair',
];

export const CONDITION_LABEL: Record<Condition, string> = {
  new_with_tags: 'New with tags',
  new_without_tags: 'New, no tags',
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
};

export const CONDITION_HINT: Record<Condition, string> = {
  new_with_tags: 'Never worn, original tags attached.',
  new_without_tags: 'Never worn, tags removed.',
  excellent: 'Worn a few times, no visible signs of wear.',
  good: 'Worn, light signs of wear such as softening or slight fading.',
  fair: 'Visible wear or a flaw, described in the listing.',
};

/**
 * The words each marketplace uses for a condition, best match first. The
 * extension picks the first option on the page whose text contains one of
 * these, so order matters.
 */
export const CONDITION_WORDS: Partial<Record<MarketplaceId, Record<Condition, string[]>>> = {
  depop: {
    new_with_tags: ['Brand new', 'New with tags'],
    new_without_tags: ['Like new'],
    excellent: ['Used - Excellent', 'Excellent'],
    good: ['Used - Good', 'Good'],
    fair: ['Used - Fair', 'Fair'],
  },
  poshmark: {
    new_with_tags: ['New With Tags', 'NWT'],
    new_without_tags: ['Like New'],
    excellent: ['Like New', 'Excellent'],
    good: ['Good'],
    fair: ['Fair'],
  },
  mercari: {
    new_with_tags: ['New'],
    new_without_tags: ['Like new'],
    excellent: ['Like new'],
    good: ['Good'],
    fair: ['Fair'],
  },
  grailed: {
    new_with_tags: ['New/Never Worn', 'New'],
    new_without_tags: ['New/Never Worn', 'New'],
    excellent: ['Gently Used'],
    good: ['Used'],
    fair: ['Very Worn'],
  },
};

/** Vinted's condition ids, as written into item_attributes { code: 'condition' }. */
export const VINTED_CONDITION_ID: Record<Condition, number> = {
  new_with_tags: 6,
  new_without_tags: 1,
  excellent: 2,
  good: 3,
  fair: 4,
};

export function conditionFromVintedId(id: number | null | undefined): Condition | null {
  for (const [condition, value] of Object.entries(VINTED_CONDITION_ID)) {
    if (value === id) return condition as Condition;
  }
  return null;
}

/**
 * eBay Inventory API condition enums for clothing, in order of preference. The
 * server checks them against the category's own condition policy and takes the
 * first one the category accepts.
 */
export const EBAY_CONDITIONS: Record<Condition, string[]> = {
  new_with_tags: ['NEW'],
  new_without_tags: ['NEW_OTHER', 'NEW'],
  excellent: ['PRE_OWNED_EXCELLENT', 'USED_EXCELLENT'],
  good: ['USED_EXCELLENT', 'USED_GOOD', 'USED_VERY_GOOD'],
  fair: ['PRE_OWNED_FAIR', 'USED_ACCEPTABLE', 'USED_GOOD'],
};

/** eBay numeric condition ids matching the enums above. */
export const EBAY_CONDITION_ENUM_ID: Record<string, number> = {
  NEW: 1000,
  NEW_OTHER: 1500,
  NEW_WITH_DEFECTS: 1750,
  PRE_OWNED_EXCELLENT: 2990,
  USED_EXCELLENT: 3000,
  USED_VERY_GOOD: 4000,
  USED_GOOD: 5000,
  USED_ACCEPTABLE: 6000,
  PRE_OWNED_FAIR: 3010,
};

export function isCondition(value: unknown): value is Condition {
  return typeof value === 'string' && (CONDITIONS as string[]).includes(value);
}
