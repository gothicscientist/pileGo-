import { describe, expect, it } from 'vitest';
import { older } from '~/routes/ExtensionPage';

describe('extension versions', () => {
  it('compares numerically', () => {
    expect(older('0.1.0', '0.2.0')).toBe(true);
    expect(older('0.9.0', '0.10.0')).toBe(true);
    expect(older('0.2.0', '0.2.0')).toBe(false);
    expect(older('1.0.0', '0.9.9')).toBe(false);
    expect(older(null, '0.2.0')).toBe(false);
  });
});
