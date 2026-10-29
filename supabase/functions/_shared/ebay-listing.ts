// Turning a pileGo item into a live eBay listing with the Inventory API:
// inventory item → offer → publish. Docs:
// https://developer.ebay.com/api-docs/sell/static/inventory/publishing-offers.html

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import { EBAY_CONDITIONS, EBAY_CONDITION_ENUM_ID } from './core/conditions.ts';
import { generateListing } from './core/listing.ts';
import { findSubcategory } from './core/taxonomy.ts';
import type { Item, Profile } from './core/types.ts';
import { ebay, EbayError, getAppToken, mediaBase, type EbaySite } from './ebay.ts';

export interface EbaySetup {
  fulfillment_policy_id: string;
  payment_policy_id: string;
  return_policy_id: string;
  location_key: string;
}

export class NeedsSeller extends Error {
  constructor(
    message: string,
    public missing: string[] = [],
    /** Allowed values for each missing eBay aspect; empty when any text works. */
    public choices: Record<string, string[]> = {},
  ) {
    super(message);
  }
}

interface AccountMeta {
  fulfillment_policy_id?: string;
  payment_policy_id?: string;
  return_policy_id?: string;
  location_key?: string;
  postal_code?: string;
  country?: string;
  region?: string;
  [key: string]: unknown;
}

const CATEGORY_TYPES = [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES' }];

/** eBay error 20403: the seller is not opted in to business policies. */
async function optInToPolicies(token: string): Promise<never> {
  try {
    await ebay({
      method: 'POST',
      path: '/sell/account/v1/program/opt_in',
      token,
      body: { programType: 'SELLING_POLICY_MANAGEMENT' },
    });
  } catch (err) {
    console.warn('business policy opt-in failed', err);
    throw new NeedsSeller('Turn on business policies in eBay Seller Hub (Account › Business policies), then try again.');
  }
  throw new NeedsSeller(
    'pileGo just turned on business policies for your eBay account. eBay can take up to an hour to finish; then create a shipping policy in Seller Hub (Account › Business policies) and press List again.',
  );
}

/** A payment policy is a formality with eBay managed payments, so pileGo makes one when there is none. */
async function createPaymentPolicy(token: string, site: EbaySite): Promise<string> {
  const r = await ebay<{ paymentPolicyId: string }>({
    method: 'POST',
    path: '/sell/account/v1/payment_policy',
    token,
    site,
    body: {
      name: 'pileGo payment',
      marketplaceId: site.marketplace_id,
      categoryTypes: CATEGORY_TYPES,
      immediatePay: true,
    },
  });
  return r.paymentPolicyId;
}

/** 30-day returns, buyer pays return postage: the common default for secondhand clothes. */
async function createReturnPolicy(token: string, site: EbaySite): Promise<string> {
  const r = await ebay<{ returnPolicyId: string }>({
    method: 'POST',
    path: '/sell/account/v1/return_policy',
    token,
    site,
    body: {
      name: 'pileGo returns',
      marketplaceId: site.marketplace_id,
      categoryTypes: CATEGORY_TYPES,
      returnsAccepted: true,
      returnPeriod: { value: 30, unit: 'DAY' },
      returnShippingCostPayer: 'BUYER',
      refundMethod: 'MONEY_BACK',
    },
  });
  return r.returnPolicyId;
}

/**
 * Find the business policies and ship-from location eBay requires. Payment
 * and return policies are created when the seller has none; a shipping
 * policy sets postage costs, so that one is the seller's to make.
 */
export async function ensureSetup(
  admin: SupabaseClient,
  userId: string,
  token: string,
  site: EbaySite,
  meta: AccountMeta,
): Promise<EbaySetup> {
  const q = { marketplace_id: site.marketplace_id };
  let [fulfillment, payment, returns] = await Promise.all([
    meta.fulfillment_policy_id
      ? Promise.resolve(meta.fulfillment_policy_id)
      : ebay<{ fulfillmentPolicies?: Array<{ fulfillmentPolicyId: string }> }>({
          path: '/sell/account/v1/fulfillment_policy', token, query: q,
        }).then(r => r.fulfillmentPolicies?.[0]?.fulfillmentPolicyId),
    meta.payment_policy_id
      ? Promise.resolve(meta.payment_policy_id)
      : ebay<{ paymentPolicies?: Array<{ paymentPolicyId: string }> }>({
          path: '/sell/account/v1/payment_policy', token, query: q,
        }).then(r => r.paymentPolicies?.[0]?.paymentPolicyId),
    meta.return_policy_id
      ? Promise.resolve(meta.return_policy_id)
      : ebay<{ returnPolicies?: Array<{ returnPolicyId: string }> }>({
          path: '/sell/account/v1/return_policy', token, query: q,
        }).then(r => r.returnPolicies?.[0]?.returnPolicyId),
  ]).catch(err => {
    if (err instanceof EbayError && err.has(20403)) return optInToPolicies(token);
    throw err;
  });

  if (!payment) payment = await createPaymentPolicy(token, site);
  if (!returns) returns = await createReturnPolicy(token, site);
  if (!fulfillment) {
    throw new NeedsSeller(
      'Create a shipping policy in eBay Seller Hub (Account › Business policies) so eBay knows what postage to charge, then press List again.',
      ['shipping policy'],
    );
  }

  let locationKey = meta.location_key;
  if (!locationKey) {
    const existing = await ebay<{ locations?: Array<{ merchantLocationKey: string }> }>({
      path: '/sell/inventory/v1/location', token, query: { limit: 1 },
    });
    locationKey = existing.locations?.[0]?.merchantLocationKey;
    if (!locationKey) {
      if (!meta.postal_code) {
        throw new NeedsSeller('Add your ship-from postcode in Settings › eBay so eBay knows where items ship from.', ['postal_code']);
      }
      locationKey = 'pilego-home';
      await ebay({
        method: 'POST',
        path: `/sell/inventory/v1/location/${locationKey}`,
        token,
        body: {
          location: { address: { postalCode: meta.postal_code, country: meta.country ?? site.country } },
          locationTypes: ['WAREHOUSE'],
          name: 'pileGo ship-from',
          merchantLocationStatus: 'ENABLED',
        },
      });
    }
  }

  const setup: EbaySetup = {
    fulfillment_policy_id: fulfillment!,
    payment_policy_id: payment!,
    return_policy_id: returns!,
    location_key: locationKey,
  };
  await admin
    .from('marketplace_accounts')
    .update({ meta: { ...meta, ...setup } })
    .eq('user_id', userId)
    .eq('marketplace', 'ebay');
  return setup;
}

// ---------------------------------------------------------------------------
// Category and item specifics
// ---------------------------------------------------------------------------

const treeIds = new Map<string, string>();

async function categoryTreeId(site: EbaySite): Promise<string> {
  const cached = treeIds.get(site.marketplace_id);
  if (cached) return cached;
  const r = await ebay<{ categoryTreeId: string }>({
    path: '/commerce/taxonomy/v1/get_default_category_tree_id',
    token: await getAppToken(),
    query: { marketplace_id: site.marketplace_id },
  });
  treeIds.set(site.marketplace_id, r.categoryTreeId);
  return r.categoryTreeId;
}

/** What to ask the category suggester: the department matters (men's vs women's jeans). */
export function categoryQuery(item: Pick<Item, 'department'>, title: string): string {
  const dept: Record<string, string> = { women: "Women's", men: "Men's", kids: 'Kids' };
  const prefix = item.department ? dept[item.department] : undefined;
  if (!prefix) return title;
  const word = prefix.toLowerCase().replace("'s", '');
  return new RegExp(`\\b${word}`, 'i').test(title) ? title : `${prefix} ${title}`;
}

export async function suggestCategory(site: EbaySite, query: string): Promise<{ id: string; name: string; tree: string }> {
  const tree = await categoryTreeId(site);
  const r = await ebay<{
    categorySuggestions?: Array<{ category: { categoryId: string; categoryName: string } }>;
  }>({
    path: `/commerce/taxonomy/v1/category_tree/${tree}/get_category_suggestions`,
    token: await getAppToken(),
    query: { q: query.slice(0, 350) },
  });
  const first = r.categorySuggestions?.[0]?.category;
  if (!first) throw new NeedsSeller('eBay could not suggest a category for this item. Add a clearer title.');
  return { id: first.categoryId, name: first.categoryName, tree };
}

export interface Aspect {
  name: string;
  required: boolean;
  mode: 'FREE_TEXT' | 'SELECTION_ONLY';
  multi: boolean;
  values: string[];
}

export async function aspectsFor(tree: string, categoryId: string): Promise<Aspect[]> {
  const r = await ebay<{
    aspects?: Array<{
      localizedAspectName: string;
      aspectConstraint: { aspectRequired?: boolean; aspectMode?: string; itemToAspectCardinality?: string; aspectUsage?: string };
      aspectValues?: Array<{ localizedValue: string }>;
    }>;
  }>({
    path: `/commerce/taxonomy/v1/category_tree/${tree}/get_item_aspects_for_category`,
    token: await getAppToken(),
    query: { category_id: categoryId },
  });
  return (r.aspects ?? []).map(a => ({
    name: a.localizedAspectName,
    required: Boolean(a.aspectConstraint.aspectRequired),
    mode: a.aspectConstraint.aspectMode === 'SELECTION_ONLY' ? 'SELECTION_ONLY' : 'FREE_TEXT',
    multi: a.aspectConstraint.itemToAspectCardinality === 'MULTI',
    values: (a.aspectValues ?? []).map(v => v.localizedValue),
  }));
}

const norm = (s: string) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Pick the allowed value that matches `wanted`, or null when nothing fits. */
export function matchValue(wanted: string, allowed: string[]): string | null {
  if (!allowed.length) return wanted;
  const w = norm(wanted);
  if (!w) return null;
  const exact = allowed.find(v => norm(v) === w);
  if (exact) return exact;
  const contained = allowed
    .filter(v => norm(v).length >= 3 && (w.includes(norm(v)) || norm(v).includes(w)))
    .sort((a, b) => b.length - a.length);
  return contained[0] ?? null;
}

/** What we know about the item, keyed by eBay's usual aspect names. */
export function candidateAspects(item: Item): Record<string, string[]> {
  const sub = findSubcategory(item.category, item.subcategory);
  const dept: Record<string, string[]> = {
    women: ['Women'],
    men: ['Men'],
    unisex: ['Unisex Adult', 'Unisex'],
    kids: ['Unisex Kids', 'Girls', 'Boys'],
  };
  const material = item.materials.map(m => m.replace(/^\d+%\s*/, '').split(/[,/]/)[0]!.trim()).filter(Boolean);
  const type = sub ? [sub.label.replace(/s$/, ''), sub.label, ...sub.search] : [];
  return {
    Brand: [item.brand?.trim() || 'Unbranded'],
    Size: sizeCandidates(item.size),
    'Size Type': ['Regular'],
    Department: item.department ? dept[item.department] ?? [] : [],
    Type: type,
    Color: item.colors.map(c => c[0]!.toUpperCase() + c.slice(1)),
    Material: material.map(m => m[0]!.toUpperCase() + m.slice(1)),
    'Outer Shell Material': material,
    // Many clothing categories require Style; the garment type is a fair answer when there are no tags.
    Style: [...item.style_tags, ...type],
    Theme: item.era ? [item.era] : [],
    Vintage: item.era && /\d0s|vintage|y2k/i.test(item.era) ? ['Yes'] : [],
    Pattern: [],
  };
}

const LETTER_SIZES: Record<string, string> = {
  'extra small': 'XS', 'x small': 'XS', small: 'S', medium: 'M', large: 'L', 'extra large': 'XL', 'x large': 'XL',
};

/** The size as printed, then without its system ("UK 10" → "10") and as a letter ("Medium" → "M"). */
export function sizeCandidates(size: string | null): string[] {
  if (!size?.trim()) return [];
  const raw = size.trim();
  const out = [raw];
  const bare = raw.replace(/^(uk|us|eu|it|fr|jp|au|size)\s*/i, '').trim();
  if (bare && bare !== raw) out.push(bare);
  const letter = LETTER_SIZES[raw.toLowerCase().replace(/[-.]/g, ' ').replace(/\s+/g, ' ')];
  if (letter) out.push(letter);
  return out;
}

export function buildAspects(
  item: Item,
  aspects: Aspect[],
  overrides: Record<string, string[]> = {},
): { values: Record<string, string[]>; missing: string[]; choices: Record<string, string[]> } {
  const known = candidateAspects(item);
  const values: Record<string, string[]> = {};
  const missing: string[] = [];
  const choices: Record<string, string[]> = {};
  for (const aspect of aspects) {
    const wanted = overrides[aspect.name] ?? known[aspect.name] ?? [];
    let picked: string[] = [];
    for (const w of wanted) {
      const v = aspect.mode === 'SELECTION_ONLY' ? matchValue(w, aspect.values) : (matchValue(w, aspect.values) ?? w);
      if (v && !picked.includes(v)) picked.push(v);
      if (picked.length && !aspect.multi) break;
    }
    picked = picked.map(v => v.slice(0, 65));
    if (picked.length) values[aspect.name] = picked;
    else if (aspect.required) {
      missing.push(aspect.name);
      choices[aspect.name] = aspect.mode === 'SELECTION_ONLY' ? aspect.values.slice(0, 200) : [];
    }
  }
  // Brand is always worth sending, even if the category does not list it.
  if (!values.Brand) values.Brand = known.Brand!;
  return { values, missing, choices };
}

async function conditionFor(token: string, site: EbaySite, categoryId: string, item: Item): Promise<string> {
  const wanted = EBAY_CONDITIONS[item.condition ?? 'good'];
  try {
    const r = await ebay<{
      itemConditionPolicies?: Array<{ itemConditions?: Array<{ conditionId: string }> }>;
    }>({
      path: `/sell/metadata/v1/marketplace/${site.marketplace_id}/get_item_condition_policies`,
      token,
      query: { filter: `categoryIds:{${categoryId}}` },
    });
    const allowed = new Set((r.itemConditionPolicies?.[0]?.itemConditions ?? []).map(c => Number(c.conditionId)));
    if (allowed.size) {
      const fit = wanted.find(c => allowed.has(EBAY_CONDITION_ENUM_ID[c] ?? -1));
      if (fit) return fit;
      // Nearest allowed: used items fall back to the first used condition.
      const usedFallback = ['USED_EXCELLENT', 'USED_GOOD', 'USED_VERY_GOOD', 'PRE_OWNED_EXCELLENT'].find(c =>
        allowed.has(EBAY_CONDITION_ENUM_ID[c]!),
      );
      if (item.condition !== 'new_with_tags' && usedFallback) return usedFallback;
    }
  } catch (err) {
    console.warn('condition policy lookup failed', err);
  }
  return wanted[0]!;
}

/**
 * Copy the photos to eBay Picture Services. pileGo's own photo links are
 * signed and expire, so eBay gets copies of its own. If the Media API
 * refuses one, the signed link is sent instead.
 */
export async function hostImages(token: string, urls: string[]): Promise<string[]> {
  return Promise.all(
    urls.map(async url => {
      try {
        const r = await ebay<{ imageUrl?: string }>({
          method: 'POST',
          base: mediaBase(),
          path: '/commerce/media/v1_beta/image/create_image_from_url',
          token,
          body: { imageUrl: url },
        });
        return r?.imageUrl || url;
      } catch (err) {
        console.warn('eBay image upload failed, sending the direct link', err instanceof Error ? err.message : err);
        return url;
      }
    }),
  );
}

function descriptionHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped
    .split(/\n{2,}/)
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export interface PublishInput {
  item: Item;
  imageUrls: string[];
  site: EbaySite;
  setup: EbaySetup;
  profile: Pick<Profile, 'voice' | 'region' | 'fee_overrides'> & { price_strategy?: 'same' | 'match_take_home' };
  overrides: { title?: string; price?: number; description?: string; aspects?: Record<string, string[]>; category_id?: string };
  offerId?: string | null;
}

export interface PublishResult {
  listing_id: string;
  offer_id: string;
  url: string;
  category_id: string;
  category_name: string;
  price: number;
  title: string;
}

export async function publishToEbay(token: string, input: PublishInput): Promise<PublishResult> {
  const { item, site, setup } = input;
  if (!input.imageUrls.length) throw new NeedsSeller('Add at least one photo before listing on eBay.');
  if (!item.price && !input.overrides.price) throw new NeedsSeller('Add a price before listing on eBay.');

  const generated = generateListing(item, 'ebay', {
    voice: input.profile.voice,
    region: input.profile.region,
    strategy: input.profile.price_strategy ?? 'same',
    fee_overrides: input.profile.fee_overrides,
  });
  const title = (input.overrides.title ?? generated.title).slice(0, 80);
  const price = input.overrides.price ?? generated.price ?? item.price!;
  const description = (input.overrides.description?.trim() || generated.description).slice(0, 4000);

  const category = input.overrides.category_id
    ? { id: input.overrides.category_id, name: '', tree: await categoryTreeId(site) }
    : await suggestCategory(site, categoryQuery(item, title));
  const aspectList = await aspectsFor(category.tree, category.id);
  const { values, missing, choices } = buildAspects(item, aspectList, input.overrides.aspects);
  if (missing.length) {
    throw new NeedsSeller(
      `eBay needs ${missing.join(', ')} for “${category.name || 'this category'}”. Fill them in on the eBay listing and press List again.`,
      missing,
      choices,
    );
  }
  const imageUrls = await hostImages(token, input.imageUrls.slice(0, 24));
  const condition = await conditionFor(token, site, category.id, item);

  await ebay({
    method: 'PUT',
    path: `/sell/inventory/v1/inventory_item/${encodeURIComponent(item.sku)}`,
    token,
    site,
    body: {
      availability: { shipToLocationAvailability: { quantity: 1 } },
      condition,
      conditionDescription: item.condition && item.condition !== 'new_with_tags' ? (item.flaws ?? undefined)?.slice(0, 1000) : undefined,
      product: {
        title,
        description,
        aspects: values,
        imageUrls,
      },
    },
  });

  const offerBody = {
    sku: item.sku,
    marketplaceId: site.marketplace_id,
    format: 'FIXED_PRICE',
    availableQuantity: 1,
    categoryId: category.id,
    listingDescription: descriptionHtml(description),
    listingPolicies: {
      fulfillmentPolicyId: setup.fulfillment_policy_id,
      paymentPolicyId: setup.payment_policy_id,
      returnPolicyId: setup.return_policy_id,
    },
    pricingSummary: { price: { value: price.toFixed(2), currency: site.currency } },
    merchantLocationKey: setup.location_key,
  };

  let offerId = input.offerId ?? null;
  if (!offerId) {
    const existing = await ebay<{ offers?: Array<{ offerId: string; marketplaceId: string }> }>({
      path: '/sell/inventory/v1/offer', token, query: { sku: item.sku },
    }).catch(err => {
      if (err instanceof EbayError && (err.status === 404 || err.has(25713))) return { offers: [] };
      throw err;
    });
    offerId = existing.offers?.find(o => o.marketplaceId === site.marketplace_id)?.offerId ?? null;
  }
  if (offerId) {
    await ebay({ method: 'PUT', path: `/sell/inventory/v1/offer/${offerId}`, token, site, body: offerBody });
  } else {
    const created = await ebay<{ offerId: string }>({ method: 'POST', path: '/sell/inventory/v1/offer', token, site, body: offerBody });
    offerId = created.offerId;
  }

  const published = await ebay<{ listingId: string }>({
    method: 'POST',
    path: `/sell/inventory/v1/offer/${offerId}/publish`,
    token,
    site,
  });

  return {
    listing_id: published.listingId,
    offer_id: offerId,
    url: site.item_url + published.listingId,
    category_id: category.id,
    category_name: category.name,
    price,
    title,
  };
}

export async function withdrawFromEbay(token: string, offerId: string): Promise<void> {
  try {
    await ebay({ method: 'POST', path: `/sell/inventory/v1/offer/${offerId}/withdraw`, token });
  } catch (err) {
    // Already ended (sold or withdrawn) counts as done.
    if (err instanceof EbayError && (err.status === 404 || err.has(25713) || /not.*(published|active)|already|ended/i.test(err.message))) return;
    throw err;
  }
}

export async function updateEbayPrice(token: string, site: EbaySite, sku: string, offerId: string, price: number): Promise<void> {
  // The call answers 200 even when an offer fails; each response has its own status.
  const r = await ebay<{
    responses?: Array<{ statusCode?: number; errors?: Array<{ errorId?: number; message?: string; longMessage?: string }> }>;
  }>({
    method: 'POST',
    path: '/sell/inventory/v1/bulk_update_price_quantity',
    token,
    site,
    body: {
      requests: [
        {
          sku,
          offers: [{ offerId, availableQuantity: 1, price: { value: price.toFixed(2), currency: site.currency } }],
        },
      ],
    },
  });
  const failed = (r?.responses ?? []).find(x => (x.statusCode ?? 200) >= 400);
  if (failed) throw new EbayError(failed.statusCode!, { errors: failed.errors ?? [] }, 'eBay did not take the new price.');
}
