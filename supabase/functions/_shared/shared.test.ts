import { assertEquals, assertThrows } from 'jsr:@std/assert@1';
import { parseJsonLoose, rankFlashModels, toGeminiSchema, withBenchedLast } from './ai.ts';
import { buildAspects, matchValue, type Aspect } from './ebay-listing.ts';
import { decodeXml, xmlValues } from './ebay.ts';
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

Deno.test('Gemini models: newest stable Flash first, no aliases or variants', () => {
  const names = [
    'models/gemini-2.5-flash', 'models/gemini-flash-latest', 'models/gemini-3-flash-preview', 'models/gemini-3.5-flash',
    'models/gemini-3.5-flash-lite', 'models/gemini-3.8-flash', 'models/gemini-3.8-flash-tts', 'models/gemini-3.1-flash-image',
    'models/gemini-omni-1.1-flash', 'models/gemini-3.10-flash',
  ];
  assertEquals(rankFlashModels(names), ['gemini-3.10-flash', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash']);
  assertEquals(withBenchedLast(['a', 'b', 'c', 'd'], m => m === 'a' || m === 'c'), ['b', 'd', 'a', 'c']);
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
