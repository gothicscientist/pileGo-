// Generated from packages/core/src by scripts/sync-core.mjs. Do not edit.
import type { SellerAddress } from './types.ts';

export const ADDRESS_COUNTRIES = ['US', 'GB', 'CA', 'AU', 'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'CH', 'NO', 'IS', 'NZ'] as const;

export function blankSellerAddress(country = 'US'): SellerAddress {
  return { full_name: '', line1: '', line2: '', city: '', state: '', postal_code: '', country, phone: '' };
}

/** A blank form is optional; a partly entered address must be completed. */
export function cleanSellerAddress(value: SellerAddress | null | undefined): SellerAddress | null {
  if (!value) return null;
  const keys = ['full_name', 'line1', 'line2', 'city', 'state', 'postal_code', 'country', 'phone'] as const;
  const address = Object.fromEntries(keys.map(k => [k, String(value[k] ?? '').trim()])) as unknown as SellerAddress;
  if (keys.filter(k => k !== 'country').every(k => !address[k])) return null;
  address.country = address.country.toUpperCase();
  if (!address.full_name || !address.line1 || !address.city || !address.postal_code || !ADDRESS_COUNTRIES.includes(address.country as typeof ADDRESS_COUNTRIES[number])) {
    throw new Error('Complete your name, street address, city, postal code and country, or leave the address blank.');
  }
  if (['US', 'CA', 'AU'].includes(address.country) && !address.state) throw new Error('Add your state or province to the address.');
  if (keys.some(k => address[k].length > (k === 'postal_code' || k === 'phone' ? 40 : 200))) throw new Error('An address field is too long. Please shorten it.');
  return address;
}

