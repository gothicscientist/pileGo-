// Turning a pileGo item into a live eBay listing with the Inventory API:
// inventory item → offer → publish. Docs:
// https://developer.ebay.com/api-docs/sell/static/inventory/publishing-offers.html

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import { EBAY_CONDITIONS, EBAY_CONDITION_ENUM_ID } from './core/conditions.ts';
import { generateListing } from './core/listing.ts';
import { findSubcategory } from './core/taxonomy.ts';
import type { Item, Profile } from './core/types.ts';
import { ebay, EbayError, getAppToken, type EbaySite } from './ebay.ts';

export interface EbaySetup {
  fulfillment_policy_id: string;
  payment_policy_id: string;
  return_policy_id: string;
  location_key: string;
}

export class NeedsSeller extends Error {
  constructor(message: string, public missing: string[] = []) {
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

/** Find (or create) the business policies and ship-from location eBay requires. */
export async function ensureSetup(
  admin: SupabaseClient,
  userId: string,
  token: string,
  site: EbaySite,
  meta: AccountMeta,
): Promise<EbaySetup> {
  const q = { marketplace_id: site.marketplace_id };
  const [fulfillment, payment, returns] = await Promise.all([
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
    if (err instanceof EbayError && err.has(20403)) {
      throw new NeedsSeller('Turn on business policies in eBay Seller Hub (Account › Business policies), then try again.');
    }
    throw err;
  });

  const missing: string[] = [];
  if (!fulfillment) missing.push('a shipping policy');
  if (!payment) missing.push('a payment policy');
  if (!returns) missing.push('a return policy');
  if (missing.length) {
    throw new NeedsSeller(
      `Create ${missing.join(', ')} in eBay Seller Hub (Account › Business policies), then try again.`,
      missing,
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
  return {
    Brand: [item.brand?.trim() || 'Unbranded'],
    Size: item.size ? [item.size] : [],
    'Size Type': ['Regular'],
    Department: item.department ? dept[item.department] ?? [] : [],
    Type: sub ? [sub.label.replace(/s$/, ''), sub.label, ...sub.search] : [],
    Color: item.colors.map(c => c[0]!.toUpperCase() + c.slice(1)),
    Material: material.map(m => m[0]!.toUpperCase() + m.slice(1)),
    'Outer Shell Material': material,
    Style: item.style_tags,
    Theme: item.era ? [item.era] : [],
    Vintage: item.era && /\d0s|vintage|y2k/i.test(item.era) ? ['Yes'] : [],
    Pattern: [],
  };
}

export function buildAspects(
  item: Item,
  aspects: Aspect[],
  overrides: Record<string, string[]> = {},
): { values: Record<string, string[]>; missing: string[] } {
  const known = candidateAspects(item);
  const values: Record<string, string[]> = {};
  const missing: string[] = [];
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
    else if (aspect.required) missing.push(aspect.name);
  }
  // Brand is always worth sending, even if the category does not list it.
  if (!values.Brand) values.Brand = known.Brand!;
  return { values, missing };
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
    : await suggestCategory(site, title);
  const aspectList = await aspectsFor(category.tree, category.id);
  const { values, missing } = buildAspects(item, aspectList, input.overrides.aspects);
  if (missing.length) {
    throw new NeedsSeller(`eBay needs ${missing.join(', ')} for “${category.name || 'this category'}”. Fill them in on the item’s eBay tab.`, missing);
  }
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
        imageUrls: input.imageUrls.slice(0, 24),
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
    if (err instanceof EbayError && (err.status === 404 || /not.*(published|active)|already/i.test(err.message))) return;
    throw err;
  }
}

export async function updateEbayPrice(token: string, site: EbaySite, sku: string, offerId: string, price: number): Promise<void> {
  await ebay({
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
}
