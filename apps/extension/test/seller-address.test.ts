// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { blankSellerAddress } from '@pilego/core';
import { fillSellerAddress, watchSellerAddress } from '../src/assist/seller-address.ts';

const address = { ...blankSellerAddress(), full_name: 'Sam Seller', line1: '123 Test Lane', line2: 'Apt 2', city: 'Berkeley', state: 'CA', postal_code: '09470', phone: '+15555550100' };
const form = (street = '') => `<form><h2>Return address</h2><input autocomplete="name"><input autocomplete="address-line1" value="${street}"><input autocomplete="address-line2"><input autocomplete="address-level2"><select autocomplete="address-level1"><option value="">State</option><option value="CA">California</option></select><input autocomplete="postal-code"><select autocomplete="country"><option value="US">United States</option><option value="GB">United Kingdom</option></select><input autocomplete="tel"></form>`;
const input = (token: string) => document.querySelector<HTMLInputElement>(`[autocomplete="${token}"]`)!;
afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });

describe('seller address form fill', () => {
  it('fills an empty seller address using native events, preserving postal zeros', () => {
    document.body.innerHTML = form() + '<textarea name="description">A shirt</textarea>';
    let events = 0; input('address-line1').addEventListener('input', () => events++);
    expect(fillSellerAddress(document, address)).toBeGreaterThan(0);
    expect(input('address-line1').value).toBe(address.line1);
    expect(input('address-level1').value).toBe('CA');
    expect(input('postal-code').value).toBe('09470');
    expect(input('tel').value).toBe(address.phone);
    expect(events).toBe(1);
    expect(document.querySelector('textarea')?.value).toBe('A shirt');
  });
  it('does not merge with a saved address or overwrite a conflicting partial address', () => {
    document.body.innerHTML = form('456 Other Road');
    expect(fillSellerAddress(document, address)).toBe(0);
    expect(input('address-line1').value).toBe('456 Other Road');
    expect(input('postal-code').value).toBe('');
    document.body.innerHTML = form();
    input('postal-code').value = '10001';
    expect(fillSellerAddress(document, address)).toBe(0);
    expect(input('address-line1').value).toBe('');
  });
  it('ignores hidden, billing, recipient, payment and unrelated listing forms', () => {
    for (const title of ['Billing address', 'Recipient address', 'Ship to buyer', 'Payment information']) {
      document.body.innerHTML = form().replace('Return address', title);
      expect(fillSellerAddress(document, address)).toBe(0);
    }
    document.body.innerHTML = '<form hidden>' + form() + '</form>';
    expect(fillSellerAddress(document, address)).toBe(0);
    document.body.innerHTML = '<form><h2>Billing address</h2><fieldset><input autocomplete="address-line1"><input autocomplete="postal-code"></fieldset></form>';
    expect(fillSellerAddress(document, address)).toBe(0);
    document.body.innerHTML = '<form><input name="name"><input name="city"><input name="price"><textarea name="description"></textarea></form>';
    expect(fillSellerAddress(document, address)).toBe(0);
  });
  it('finds address labels without autocomplete and supports multiline street addresses', () => {
    document.body.innerHTML = '<form><label>Street address<input name="addressLine1"></label><label>Postcode<input name="postalCode"></label><label>City<input name="city"></label></form>';
    fillSellerAddress(document, address);
    expect(document.querySelector<HTMLInputElement>('[name="addressLine1"]')?.value).toBe(address.line1);
    document.body.innerHTML = '<form><textarea autocomplete="street-address"></textarea><input autocomplete="postal-code"></form>';
    fillSellerAddress(document, address);
    expect(document.querySelector('textarea')?.value).toBe('123 Test Lane\nApt 2');
  });
  it('fills late address dialogs and dependent fields once, and stops watching', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<main></main>';
    const stop = watchSellerAddress(document, address);
    document.body.innerHTML = form();
    await vi.advanceTimersByTimeAsync(150);
    expect(input('address-line1').value).toBe(address.line1);
    input('address-level1').remove();
    const state = document.createElement('input'); state.autocomplete = 'address-level1';
    document.querySelector('form')!.append(state);
    await vi.advanceTimersByTimeAsync(150);
    expect(state.value).toBe('CA');
    stop();
    document.body.innerHTML = form();
    await vi.advanceTimersByTimeAsync(150);
    expect(input('address-line1').value).toBe('');
  });
  it('respects seller edits and invalid or missing saved addresses', () => {
    document.body.innerHTML = form();
    const touched = new WeakSet<Element>([input('address-line1')]);
    expect(fillSellerAddress(document, address, touched)).toBe(0);
    expect(fillSellerAddress(document, null)).toBe(0);
    expect(fillSellerAddress(document, { ...address, city: '' })).toBe(0);
  });
  it('supports separate name fields and keeps disabled controls untouched', () => {
    document.body.innerHTML = '<form><input autocomplete="given-name"><input autocomplete="family-name"><input name="addressLine1"><input autocomplete="postal-code" disabled></form>';
    fillSellerAddress(document, address);
    expect(input('given-name').value).toBe('Sam');
    expect(input('family-name').value).toBe('Seller');
    expect(document.querySelector<HTMLInputElement>('[name="addressLine1"]')?.value).toBe(address.line1);
    expect(input('postal-code').value).toBe('');
  });
});

