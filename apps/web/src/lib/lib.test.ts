import type { Item, Job } from '@pilego/core';
import { describe, expect, it } from 'vitest';
import { diffForm, emptyForm } from '~/components/ItemForm';
import { daysSince, inkOn, plural, seeded } from './format';
import { nextUp } from './nextup';

const base: Item = {
  id: 'i1', user_id: 'u', sku: 'TOP-AAAAA', status: 'draft', title: 'Tee', brand: null, department: null, category: 'tops',
  subcategory: null, size: null, size_system: null, colors: [], materials: [], condition: null, flaws: null, measurements: null,
  style_tags: [], era: null, description: '', price: null, original_price: null, cost: null, currency: 'USD', location: null,
  notes: null, ai: null, price_suggestion: null, sold_at: null, sold_price: null, sold_marketplace: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', photos: [], listings: [],
};

describe('format helpers', () => {
  it('picks readable text on sticker colours', () => {
    expect(inkOn('#FFE14D')).toBe('#16172B');
    expect(inkOn('#111111')).toBe('#FFFFFF');
  });
  it('counts whole days and pluralises', () => {
    expect(daysSince(new Date(Date.now() - 3.5 * 86_400_000).toISOString())).toBe(3);
    expect(daysSince(null)).toBeNull();
    expect(plural(1, 'piece')).toBe('1 piece');
    expect(plural(4, 'piece')).toBe('4 pieces');
  });
  it('scatters the same item to the same place every time', () => {
    expect(seeded('abc', 1)).toBe(seeded('abc', 1));
    expect(seeded('abc', 1)).not.toBe(seeded('abc', 2));
    expect(seeded('abc')).toBeGreaterThanOrEqual(0);
    expect(seeded('abc')).toBeLessThan(1);
  });
});

describe('item form', () => {
  it('sends only changed fields', () => {
    const before = emptyForm();
    const after = { ...before, title: 'New', colors: ['Red'] };
    expect(diffForm(before, after)).toEqual({ title: 'New', colors: ['Red'] });
    expect(diffForm(before, { ...before })).toEqual({});
  });
});

describe('next up', () => {
  it('puts jobs that need the seller first, then shipping, pricing and listing', () => {
    const items: Item[] = [
      { ...base, id: 'draft', title: 'Draft tee' },
      { ...base, id: 'ready', title: 'Ready jeans', status: 'ready', price: 30 },
      { ...base, id: 'sold', title: 'Sold boots', status: 'sold' },
    ];
    const jobs = [{ id: 'j', status: 'needs_user', kind: 'publish', marketplace: 'poshmark', item_id: 'ready' } as Job];
    const list = nextUp(items, jobs, 30, 10).map(n => n.text);
    expect(list[0]).toBe('Finish Ready jeans on Poshmark');
    expect(list).toContain('Ship Sold boots');
    expect(list).toContain('Price Draft tee');
    expect(list).toContain('List Ready jeans');
  });
});
