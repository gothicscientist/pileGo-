import { describe, expect, it } from 'vitest';
import { blankSellerAddress, cleanSellerAddress } from './seller-address.ts';

const address = { ...blankSellerAddress(), full_name: 'Sam Seller', line1: '123 Test Lane', city: 'Berkeley', state: 'CA', postal_code: '09470' };
describe('private seller addresses', () => {
  it('allows blank setup and normalizes complete addresses', () => {
    expect(cleanSellerAddress(blankSellerAddress())).toBeNull();
    expect(cleanSellerAddress(null)).toBeNull();
    expect(cleanSellerAddress({ ...address, full_name: ' Sam Seller ', country: 'us' })).toEqual({ ...address, full_name: 'Sam Seller' });
  });
  it('requires complete addresses and a state where needed', () => {
    expect(() => cleanSellerAddress({ ...address, city: '' })).toThrow('Complete');
    expect(() => cleanSellerAddress({ ...address, state: '' })).toThrow('state or province');
    expect(cleanSellerAddress({ ...address, country: 'GB', state: '', postal_code: 'SW1A 1AA' })?.postal_code).toBe('SW1A 1AA');
    expect(() => cleanSellerAddress({ ...address, country: 'XX' })).toThrow('country');
  });
  it('does not accept unbounded or extra fields', () => {
    expect(() => cleanSellerAddress({ ...address, line1: 'x'.repeat(201) })).toThrow('too long');
    expect(cleanSellerAddress({ ...address, unexpected: 'not persisted' } as typeof address)).not.toHaveProperty('unexpected');
    expect(cleanSellerAddress(address)?.postal_code).toBe('09470');
  });
});

