import { assertEquals, assertThrows } from 'jsr:@std/assert@1';
import { parseJsonLoose, toGeminiSchema } from './ai.ts';
import { buildAspects, matchValue, type Aspect } from './ebay-listing.ts';
import { decodeXml, xmlValues } from './ebay.ts';
import { isServiceCall } from './supabase.ts';
import type { Item } from './core/types.ts';

const item = {
  id: 'i', user_id: 'u', sku: 'OUT-ABCDE', status: 'ready', title: 'Denim trucker jacket', brand: "Levi's",
  department: 'men', category: 'outerwear', subcategory: 'denim-jackets', size: 'M', size_system: null,
  colors: ['blue'], materials: ['100% cotton'], condition: 'good', flaws: null, measurements: null,
  style_tags: ['workwear'], era: '90s', description: '', price: 50, original_price: null, cost: null,
  currency: 'USD', location: null, notes: null, ai: null, price_suggestion: null, sold_at: null,
  sold_price: null, sold_marketplace: null, created_at: '', updated_at: '',
} as Item;

Deno.test('matchValue picks the allowed spelling', () => {
  assertEquals(matchValue('levis', ["Levi's", 'Lee']), "Levi's");
  assertEquals(matchValue("Levi's", ["Levi's", 'Lee']), "Levi's");
  assertEquals(matchValue('Denim Jacket', ['Jacket', 'Coat']), 'Jacket');
  assertEquals(matchValue('anything', []), 'anything');
});

Deno.test('buildAspects fills required aspects and reports gaps', () => {
  const aspects: Aspect[] = [
    { name: 'Brand', required: true, mode: 'FREE_TEXT', multi: false, values: [] },
    { name: 'Size', required: true, mode: 'FREE_TEXT', multi: false, values: ['S', 'M', 'L'] },
    { name: 'Department', required: true, mode: 'SELECTION_ONLY', multi: false, values: ['Men', 'Women', 'Unisex Adult'] },
    { name: 'Type', required: true, mode: 'SELECTION_ONLY', multi: false, values: ['Jacket', 'Coat'] },
    { name: 'Size Type', required: true, mode: 'SELECTION_ONLY', multi: false, values: ['Regular', 'Big & Tall'] },
    { name: 'Outer Shell Material', required: false, mode: 'FREE_TEXT', multi: false, values: [] },
    { name: 'Closure', required: true, mode: 'SELECTION_ONLY', multi: false, values: ['Button', 'Zip'] },
  ];
  const { values, missing } = buildAspects(item, aspects);
  assertEquals(values.Brand, ["Levi's"]);
  assertEquals(values.Size, ['M']);
  assertEquals(values.Department, ['Men']);
  assertEquals(values.Type, ['Jacket']);
  assertEquals(values['Size Type'], ['Regular']);
  assertEquals(values['Outer Shell Material'], ['cotton']);
  assertEquals(missing, ['Closure']);
  const fixed = buildAspects(item, aspects, { Closure: ['Button'] });
  assertEquals(fixed.missing, []);
});

Deno.test('Gemini schema types are upper-cased', () => {
  const s = toGeminiSchema({ type: 'object', properties: { a: { type: 'array', items: { type: 'string', enum: ['x'] } } } }) as any;
  assertEquals(s.type, 'OBJECT');
  assertEquals(s.properties.a.items.type, 'STRING');
  assertEquals(s.properties.a.items.enum, ['x']);
});

Deno.test('parseJsonLoose reads fenced and padded JSON', () => {
  assertEquals(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assertEquals(parseJsonLoose('Sure! {"a":2} hope that helps'), { a: 2 });
  assertThrows(() => parseJsonLoose('nope'));
});

Deno.test('xml helpers', () => {
  const xml = '<Item><ItemID>1</ItemID><Title>A &amp; B</Title></Item><Item><ItemID>2</ItemID></Item>';
  assertEquals(xmlValues(xml, 'ItemID'), ['1', '2']);
  assertEquals(xmlValues(xml, 'Title'), ['A & B']);
  assertEquals(decodeXml('<![CDATA[x<y]]>'), 'x<y');
});

Deno.test('isServiceCall accepts the service role key and any secret key', () => {
  const saved = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS'].map(n => [n, Deno.env.get(n)] as const);
  const call = (authorization?: string) =>
    isServiceCall(new Request('http://x', { headers: authorization ? { Authorization: authorization } : {} }));
  try {
    Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'legacy-jwt');
    Deno.env.set('SUPABASE_SECRET_KEYS', '{"default":"sb_secret_a","cron":"sb_secret_b"}');
    assertEquals(call('Bearer legacy-jwt'), true);
    assertEquals(call('Bearer sb_secret_a'), true);
    assertEquals(call('Bearer sb_secret_b'), true);
    assertEquals(call('Bearer someone-elses-jwt'), false);
    assertEquals(call('Bearer '), false);
    assertEquals(call(), false);
    Deno.env.set('SUPABASE_SECRET_KEYS', 'not json');
    assertEquals(call('Bearer legacy-jwt'), true);
  } finally {
    for (const [n, v] of saved) v === undefined ? Deno.env.delete(n) : Deno.env.set(n, v);
  }
});
