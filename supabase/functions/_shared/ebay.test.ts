// eBay flows against a mocked fetch: nothing here reaches eBay.

import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import type { Item } from './core/types.ts';
import { EBAY_SITES } from './ebay.ts';
import {
  categoryQuery,
  ensureSetup,
  NeedsSeller,
  publishToEbay,
  sizeCandidates,
  updateEbayPrice,
  type EbaySetup,
} from './ebay-listing.ts';
import { derToRaw, parseSignatureHeader, verifySignature } from './ebay-notify.ts';

Deno.env.set('EBAY_CLIENT_ID', 'client');
Deno.env.set('EBAY_CLIENT_SECRET', 'secret');
Deno.env.set('EBAY_RU_NAME', 'ru');

const US = EBAY_SITES.US!;

const item = {
  id: 'i', user_id: 'u', sku: 'KNI-ABCDE', status: 'ready', title: 'Vintage GAP arch logo hoodie', brand: 'GAP',
  department: 'men', category: 'knitwear', subcategory: 'hoodies', size: 'Medium', size_system: 'letter',
  colors: ['brown'], materials: ['80% cotton, 20% polyester'], condition: 'excellent', flaws: 'Light wear on cuffs',
  measurements: null, style_tags: [], era: '90s', description: 'A soft brown hoodie.', price: 32, original_price: null,
  cost: null, currency: 'USD', location: null, notes: null, ai: null, price_suggestion: null, sold_at: null,
  sold_price: null, sold_marketplace: null, created_at: '', updated_at: '',
} as Item;

interface Call {
  method: string;
  url: URL;
  body: unknown;
}

/** Replace fetch for one test. `route` answers each call: [status, body]. */
async function withFetch(route: (c: Call) => [number, unknown], run: (calls: Call[]) => Promise<void>) {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const raw = init?.body;
    const body = typeof raw === 'string' ? (raw.startsWith('{') ? JSON.parse(raw) : raw) : raw ?? null;
    const call = { method: init?.method ?? 'GET', url, body };
    calls.push(call);
    const [status, out] = route(call);
    return new Response(status === 204 ? null : JSON.stringify(out), { status });
  }) as typeof fetch;
  try {
    await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

const fakeAdmin = () => {
  const updates: unknown[] = [];
  const chain = { eq: () => chain, then: (r: (v: unknown) => void) => r({ error: null }) };
  return {
    updates,
    client: { from: () => ({ update: (v: unknown) => (updates.push(v), chain) }) } as unknown as SupabaseClient,
  };
};

Deno.test('sizeCandidates offers the bare and letter forms', () => {
  assertEquals(sizeCandidates('UK 10'), ['UK 10', '10']);
  assertEquals(sizeCandidates('Medium'), ['Medium', 'M']);
  assertEquals(sizeCandidates('M'), ['M']);
  assertEquals(sizeCandidates(null), []);
});

Deno.test('categoryQuery adds the department once', () => {
  assertEquals(categoryQuery({ department: 'men' }, 'GAP hoodie'), "Men's GAP hoodie");
  assertEquals(categoryQuery({ department: 'men' }, "Men's GAP hoodie"), "Men's GAP hoodie");
  assertEquals(categoryQuery({ department: 'women' }, 'Mens style blazer'), "Women's Mens style blazer");
  assertEquals(categoryQuery({ department: 'unisex' }, 'Tote bag'), 'Tote bag');
});

Deno.test('publishToEbay runs category, aspects, images, inventory item, offer and publish', async () => {
  await withFetch(
    ({ method, url }) => {
      const p = url.pathname;
      if (p.endsWith('/oauth2/token')) return [200, { access_token: 'app', expires_in: 7200, token_type: 'Bearer' }];
      if (p.endsWith('get_default_category_tree_id')) return [200, { categoryTreeId: '0' }];
      if (p.endsWith('get_category_suggestions')) {
        return [200, { categorySuggestions: [{ category: { categoryId: '155183', categoryName: 'Hoodies & Sweatshirts' } }] }];
      }
      if (p.endsWith('get_item_aspects_for_category')) {
        const a = (name: string, mode: string, values: string[] = []) => ({
          localizedAspectName: name,
          aspectConstraint: { aspectRequired: true, aspectMode: mode, itemToAspectCardinality: 'SINGLE' },
          aspectValues: values.map(localizedValue => ({ localizedValue })),
        });
        return [200, {
          aspects: [
            a('Brand', 'FREE_TEXT'),
            a('Size', 'SELECTION_ONLY', ['S', 'M', 'L']),
            a('Size Type', 'SELECTION_ONLY', ['Regular', 'Big & Tall']),
            a('Department', 'SELECTION_ONLY', ['Men', 'Women']),
            a('Type', 'SELECTION_ONLY', ['Hoodie', 'Sweatshirt']),
            a('Color', 'FREE_TEXT'),
            a('Style', 'FREE_TEXT'),
          ],
        }];
      }
      if (p.endsWith('get_item_condition_policies')) {
        return [200, { itemConditionPolicies: [{ itemConditions: [{ conditionId: '1000' }, { conditionId: '2990' }, { conditionId: '3000' }, { conditionId: '3010' }] }] }];
      }
      if (url.host === 'apim.ebay.com' && p.endsWith('create_image_from_url')) {
        return [201, { imageUrl: 'https://i.ebayimg.com/images/g/x.jpg', expirationDate: '2027-01-01T00:00:00Z' }];
      }
      if (method === 'PUT' && p.includes('/inventory_item/')) return [204, null];
      if (method === 'GET' && p.endsWith('/offer')) return [404, { errors: [{ errorId: 25713, message: 'not found' }] }];
      if (method === 'POST' && p.endsWith('/offer')) return [201, { offerId: 'OFF1' }];
      if (p.endsWith('/offer/OFF1/publish')) return [200, { listingId: '1234567890' }];
      return [500, { errors: [{ message: `unexpected ${method} ${p}` }] }];
    },
    async calls => {
      const setup: EbaySetup = { fulfillment_policy_id: 'F', payment_policy_id: 'P', return_policy_id: 'R', location_key: 'pilego-home' };
      const result = await publishToEbay('user-token', {
        item,
        imageUrls: ['https://x.supabase.co/storage/v1/object/sign/photos/a.jpg?token=t'],
        site: US,
        setup,
        profile: { voice: { tone: 'friendly', sign_off: null, always_mention: [], avoid_words: [] }, region: 'US', fee_overrides: {} },
        overrides: {},
      });
      assertEquals(result.listing_id, '1234567890');
      assertEquals(result.url, 'https://www.ebay.com/itm/1234567890');
      assertEquals(result.category_id, '155183');

      const suggest = calls.find(c => c.url.pathname.endsWith('get_category_suggestions'))!;
      // The eBay title already names the department, so it is not added twice.
      assertEquals(suggest.url.searchParams.get('q')!.match(/men's/gi)?.length, 1);

      const inv = calls.find(c => c.method === 'PUT' && c.url.pathname.includes('/inventory_item/'))!;
      const body = inv.body as { condition: string; conditionDescription?: string; product: { aspects: Record<string, string[]>; imageUrls: string[] } };
      assertEquals(body.condition, 'PRE_OWNED_EXCELLENT');
      assertEquals(body.conditionDescription, 'Light wear on cuffs');
      assertEquals(body.product.imageUrls, ['https://i.ebayimg.com/images/g/x.jpg']);
      assertEquals(body.product.aspects.Size, ['M']);
      assertEquals(body.product.aspects.Type, ['Hoodie']);
      assertEquals(body.product.aspects.Department, ['Men']);
      assertEquals(body.product.aspects.Style, ['Hoodie']);

      const offer = calls.find(c => c.method === 'POST' && c.url.pathname.endsWith('/offer'))!;
      const o = offer.body as { pricingSummary: { price: { value: string; currency: string } }; listingPolicies: Record<string, string> };
      assertEquals(o.pricingSummary.price, { value: '32.00', currency: 'USD' });
      assertEquals(o.listingPolicies.fulfillmentPolicyId, 'F');
    },
  );
});

Deno.test('publishToEbay names missing aspects and their choices', async () => {
  await withFetch(
    ({ url }) => {
      const p = url.pathname;
      if (p.endsWith('/oauth2/token')) return [200, { access_token: 'app', expires_in: 7200, token_type: 'Bearer' }];
      if (p.endsWith('get_default_category_tree_id')) return [200, { categoryTreeId: '0' }];
      if (p.endsWith('get_category_suggestions')) return [200, { categorySuggestions: [{ category: { categoryId: '1', categoryName: 'Hoodies' } }] }];
      if (p.endsWith('get_item_aspects_for_category')) {
        return [200, {
          aspects: [{
            localizedAspectName: 'Closure',
            aspectConstraint: { aspectRequired: true, aspectMode: 'SELECTION_ONLY' },
            aspectValues: [{ localizedValue: 'Zip' }, { localizedValue: 'Pullover' }],
          }],
        }];
      }
      return [500, {}];
    },
    async () => {
      const err = await assertRejects(
        () =>
          publishToEbay('t', {
            item,
            imageUrls: ['https://x/a.jpg'],
            site: US,
            setup: { fulfillment_policy_id: 'F', payment_policy_id: 'P', return_policy_id: 'R', location_key: 'L' },
            profile: { voice: { tone: 'friendly', sign_off: null, always_mention: [], avoid_words: [] }, region: 'US', fee_overrides: {} },
            overrides: { category_id: '1' },
          }),
        NeedsSeller,
      );
      assertEquals(err.missing, ['Closure']);
      assertEquals(err.choices, { Closure: ['Zip', 'Pullover'] });
    },
  );
});

Deno.test('ensureSetup creates payment and return policies but asks for shipping', async () => {
  await withFetch(
    ({ method, url }) => {
      const p = url.pathname;
      if (method === 'GET' && p.endsWith('fulfillment_policy')) return [200, { fulfillmentPolicies: [{ fulfillmentPolicyId: 'F1' }] }];
      if (method === 'GET' && p.endsWith('payment_policy')) return [200, { paymentPolicies: [] }];
      if (method === 'GET' && p.endsWith('return_policy')) return [200, {}];
      if (method === 'POST' && p.endsWith('payment_policy')) return [201, { paymentPolicyId: 'P1' }];
      if (method === 'POST' && p.endsWith('return_policy')) return [201, { returnPolicyId: 'R1' }];
      if (method === 'GET' && p.endsWith('/location')) return [200, { locations: [{ merchantLocationKey: 'home' }] }];
      return [500, {}];
    },
    async calls => {
      const admin = fakeAdmin();
      const setup = await ensureSetup(admin.client, 'u', 't', US, {});
      assertEquals(setup, { fulfillment_policy_id: 'F1', payment_policy_id: 'P1', return_policy_id: 'R1', location_key: 'home' });
      const ret = calls.find(c => c.method === 'POST' && c.url.pathname.endsWith('return_policy'))!.body as Record<string, unknown>;
      assertEquals(ret.returnsAccepted, true);
      assertEquals(ret.marketplaceId, 'EBAY_US');
      assertEquals(admin.updates.length, 1);
    },
  );

  await withFetch(
    ({ url }) => (url.pathname.endsWith('fulfillment_policy') ? [200, { fulfillmentPolicies: [] }] : [200, { paymentPolicies: [{ paymentPolicyId: 'P' }], returnPolicies: [{ returnPolicyId: 'R' }] }]),
    async () => {
      const err = await assertRejects(() => ensureSetup(fakeAdmin().client, 'u', 't', US, {}), NeedsSeller);
      assertEquals(err.missing, ['shipping policy']);
    },
  );
});

Deno.test('ensureSetup opts the seller in to business policies on error 20403', async () => {
  await withFetch(
    ({ method, url }) => {
      if (method === 'POST' && url.pathname.endsWith('/program/opt_in')) return [200, {}];
      return [400, { errors: [{ errorId: 20403, message: 'User is not eligible for Business Policy.' }] }];
    },
    async calls => {
      await assertRejects(() => ensureSetup(fakeAdmin().client, 'u', 't', US, {}), NeedsSeller, 'turned on business policies');
      const optIn = calls.find(c => c.url.pathname.endsWith('/program/opt_in'))!;
      assertEquals(optIn.body, { programType: 'SELLING_POLICY_MANAGEMENT' });
    },
  );
});

Deno.test('updateEbayPrice fails when eBay rejects the offer inside a 200', async () => {
  await withFetch(
    () => [200, { responses: [{ statusCode: 400, errors: [{ errorId: 25001, message: 'Price too low' }] }] }],
    async () => {
      await assertRejects(() => updateEbayPrice('t', US, 'SKU', 'OFF', 1), Error, 'Price too low');
    },
  );
  await withFetch(
    () => [200, { responses: [{ statusCode: 200 }] }],
    async () => {
      await updateEbayPrice('t', US, 'SKU', 'OFF', 10);
    },
  );
});

// --- Notification signatures -------------------------------------------------

/** WebCrypto signs ECDSA as raw r||s; eBay sends DER, so build one. */
function rawToDer(raw: Uint8Array): Uint8Array {
  const int = (b: Uint8Array) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    let v = b.slice(i);
    if (v[0]! & 0x80) v = new Uint8Array([0, ...v]);
    return [0x02, v.length, ...v];
  };
  const r = int(raw.slice(0, 32));
  const s = int(raw.slice(32));
  return new Uint8Array([0x30, r.length + s.length, ...r, ...s]);
}

async function signedNotification(body: string) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-1' }, kp.privateKey, new TextEncoder().encode(body)));
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', kp.publicKey));
  // eBay's getPublicKey returns the PEM without line breaks.
  const key = `-----BEGIN PUBLIC KEY-----${encodeBase64(spki)}-----END PUBLIC KEY-----`;
  const header = encodeBase64(JSON.stringify({ alg: 'ECDSA', kid: 'kid-1', signature: encodeBase64(rawToDer(raw)), digest: 'SHA1' }));
  return { key: { key, algorithm: 'ECDSA', digest: 'SHA1' }, header, raw };
}

Deno.test('derToRaw undoes DER', () => {
  const raw = new Uint8Array(64).map((_, i) => (i === 0 || i === 32 ? 0x90 : i));
  assertEquals(derToRaw(rawToDer(raw)), raw);
  const small = new Uint8Array(64).map((_, i) => (i < 3 || (i >= 32 && i < 34) ? 0 : 7));
  assertEquals(derToRaw(rawToDer(small)), small);
});

Deno.test('verifySignature accepts eBay-signed bodies and rejects others', async () => {
  const body = JSON.stringify({
    metadata: { topic: 'MARKETPLACE_ACCOUNT_DELETION', schemaVersion: '1.0', deprecated: false },
    notification: { notificationId: 'n', data: { username: 'seller1', userId: 'abc' } },
  });
  const { key, header } = await signedNotification(body);
  const parsed = parseSignatureHeader(header)!;
  assertEquals(parsed.kid, 'kid-1');
  assert(await verifySignature(body, parsed, key));
  // Pretty-printed JSON with the same content still verifies.
  assert(await verifySignature(JSON.stringify(JSON.parse(body), null, 2), parsed, key));
  assertEquals(await verifySignature(body.replace('seller1', 'someone'), parsed, key), false);
  assertEquals(parseSignatureHeader('not base64 json'), null);
  assertEquals(parseSignatureHeader(null), null);
});
