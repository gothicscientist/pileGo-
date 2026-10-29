// Private seller details only go into a recognizable address form in an active listing job.
// No address is written into listing descriptions or account/payment forms.
import { cleanSellerAddress, type SellerAddress } from '@pilego/core';
import { setValue } from './sites.ts';

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type Key = keyof SellerAddress | 'street' | 'first_name' | 'last_name';
const WORDS: Record<Key, RegExp> = {
  full_name: /\b(full name|name on (?:the )?address|contact name)\b/,
  first_name: /\b(first name|given name)\b/,
  last_name: /\b(last name|family name|surname)\b/,
  line1: /\b(address (?:line )?1|street address|street line|street)\b/,
  line2: /\b(address (?:line )?2|apartment|apt|suite|unit)\b/,
  city: /\b(city|town|locality)\b/,
  state: /\b(state|province|county|region)\b/,
  postal_code: /\b(zip(?: code)?|postal(?: code)?|post code|postcode)\b/,
  country: /\bcountry\b/,
  phone: /\b(phone|telephone|mobile)\b/,
  street: /\bstreet address\b/,
};
const TOKENS: Record<string, Key> = { name: 'full_name', 'given-name': 'first_name', 'family-name': 'last_name', 'address-line1': 'line1', 'address-line2': 'line2', 'street-address': 'street', 'address-level2': 'city', 'address-level1': 'state', 'postal-code': 'postal_code', country: 'country', 'country-name': 'country', tel: 'phone' };

function words(value: string) {
  return value.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/[_\-.\[\]]/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();
}
function label(el: Control) {
  return words([el.name, el.id, el.getAttribute('aria-label'), el.getAttribute('placeholder'), ...Array.from(el.labels ?? []).map(l => l.textContent)].filter(Boolean).join(' '));
}
function visible(el: Control) {
  if (el.disabled || el.hasAttribute('readonly') || el instanceof el.ownerDocument.defaultView!.HTMLInputElement && ['hidden', 'password', 'email', 'file', 'checkbox', 'radio', 'submit'].includes(el.type)) return false;
  for (let p: Element | null = el; p; p = p.parentElement) {
    const css = el.ownerDocument.defaultView?.getComputedStyle(p);
    if (p.hasAttribute('hidden') || p.getAttribute('aria-hidden') === 'true' || css?.display === 'none' || css?.visibility === 'hidden') return false;
  }
  return true;
}
function keyFor(el: Control): Key | null {
  const autocomplete = (el.getAttribute('autocomplete') ?? '').split(/\s+/);
  if (autocomplete.includes('billing')) return null;
  const token = autocomplete.at(-1) ?? '';
  if (TOKENS[token]) return TOKENS[token]!;
  const hint = label(el);
  if (/buyer|recipient|billing|email|search|item name|listing/.test(hint)) return null;
  // Line 2 must win over an address label that includes both lines.
  for (const key of ['line2', 'line1', 'postal_code', 'city', 'state', 'country', 'full_name', 'first_name', 'last_name', 'phone'] as Key[]) {
    if (WORDS[key].test(hint)) return key;
  }
  return null;
}
function countryName(country: string) {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(country) ?? country; } catch { return country; }
}
function write(el: Control, value: string, key: Key) {
  const win = el.ownerDocument.defaultView!;
  if (el instanceof win.HTMLSelectElement) {
    const wants = [value, ...(key === 'country' ? [countryName(value), ...(value === 'GB' ? ['UK', 'United Kingdom', 'Great Britain'] : [])] : [])].map(words);
    const option = Array.from(el.options).find(o => !o.disabled && wants.some(v => words(o.value) === v || words(o.textContent ?? '') === v));
    if (!option || option.value === el.value) return;
    Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, 'value')!.set!.call(el, option.value);
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
    el.dispatchEvent(new win.Event('change', { bubbles: true }));
  } else {
    setValue(el, value);
  }
}

/** Returns a count, never a copy of the personal data, for progress reporting. */
export function fillSellerAddress(doc: Document, raw: SellerAddress | null | undefined, touched = new WeakSet<Element>(), owned = new WeakSet<Element>()): number {
  let address: SellerAddress | null;
  try { address = cleanSellerAddress(raw); } catch { return 0; }
  if (!address) return 0;
  const names = address.full_name.split(/\s+/);
  const values = { ...address, first_name: names.slice(0, -1).join(' ') || names[0]!, last_name: names.length > 1 ? names.at(-1)! : '' };
  const all = Array.from(doc.querySelectorAll<Control>('input, textarea, select')).filter(visible);
  const streets = all.filter(el => ['line1', 'street'].includes(keyFor(el) ?? ''));
  let count = 0;
  for (const street of streets) {
    const scope = street.closest('fieldset, [role="dialog"], form, section') ?? street.parentElement;
    const form = street.closest('form, [role="dialog"]') ?? scope;
    if (!scope || /billing|payment|credit card|recipient|buyer address|ship to|shipping to/i.test([scope.textContent, form?.querySelector('h1, h2, h3, legend')?.textContent].join(' ')) || /checkout|payment|billing/.test(form?.getAttribute('action') ?? '')) continue;
    const fields = all.filter(el => scope.contains(el));
    // A saved street, or a seller's own edits, always wins. Do not merge addresses.
    const expectedStreet = keyFor(street) === 'street' ? [address.line1, address.line2].filter(Boolean).join('\n') : address.line1;
    if ((street.value.trim() && (!owned.has(street) || street.value.trim() !== expectedStreet)) || fields.some(el => touched.has(el))) continue;
    if (fields.some(el => {
      const key = keyFor(el);
      return (key === 'city' || key === 'postal_code') && el.value.trim() && words(el.value) !== words(address![key]);
    })) continue;
    // Country first; changing it may cause the site to render a different state field.
    const ordered = fields.sort((a, b) => Number(keyFor(b) === 'country') - Number(keyFor(a) === 'country'));
    for (const el of ordered) {
      const key = keyFor(el);
      if (!key || key === 'line1' || key === 'street' || (el.value.trim() && key !== 'country')) continue;
      const value = values[key];
      if (value) { write(el, key === 'country' && el.getAttribute('autocomplete')?.endsWith('country-name') ? countryName(value) : value, key); count++; }
    }
    const key = keyFor(street);
    const streetValue = key === 'street' ? [address.line1, address.line2].filter(Boolean).join('\n') : address.line1;
    if (!street.value.trim()) { write(street, streetValue, key!); owned.add(street); count++; }
  }
  return count;
}

/** Watches late-rendered address dialogs while this listing job is active. */
export function watchSellerAddress(doc: Document, address: SellerAddress | null | undefined): () => void {
  if (!address) return () => {};
  const touched = new WeakSet<Element>();
  const owned = new WeakSet<Element>();
  const startPath = doc.location?.pathname;
  const onInput = (event: Event) => { if (event.isTrusted && event.target instanceof doc.defaultView!.Element) touched.add(event.target); };
  const run = () => {
    if (doc.location?.pathname !== startPath) { stop(); return; }
    fillSellerAddress(doc, address, touched, owned);
  };
  let pending: ReturnType<typeof setTimeout> | undefined;
  const observer = new doc.defaultView!.MutationObserver(() => {
    clearTimeout(pending);
    pending = setTimeout(run, 120);
  });
  doc.addEventListener('input', onInput, true);
  doc.addEventListener('change', onInput, true);
  run();
  observer.observe(doc.documentElement, { childList: true, subtree: true });
  const expiry = setTimeout(stop, 5 * 60_000);
  function stop() {
    clearTimeout(expiry); clearTimeout(pending); observer.disconnect();
    doc.removeEventListener('input', onInput, true); doc.removeEventListener('change', onInput, true);
  }
  return stop;
}

