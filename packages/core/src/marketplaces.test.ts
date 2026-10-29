import { expect, it } from 'vitest';
import { isMarketplaceId, MARKETPLACE_IDS } from './marketplaces.ts';

it('offers six marketplaces and rejects removed or invalid saved selections', () => {
  expect(MARKETPLACE_IDS).toEqual(['ebay', 'vinted', 'depop', 'poshmark', 'mercari', 'grailed']);
  expect(['etsy', 'vestiaire', 'facebook', 'toString', null].map(isMarketplaceId)).toEqual([false, false, false, false, false]);
  expect(['etsy', 'depop', 'facebook', 'grailed'].filter(isMarketplaceId)).toEqual(['depop', 'grailed']);
});
