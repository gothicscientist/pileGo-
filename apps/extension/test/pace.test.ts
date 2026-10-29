import { describe, expect, it } from 'vitest';
import { blockFor, refusalKind, retryAfterMs, waitForCap } from '../src/shared/pace.ts';
import { pageState, pagePrice } from '../src/shared/sold.ts';

describe('pacing', () => {
  it('only stops for rate limits and bot checks', () => {
    expect(refusalKind(429, '')).toBe(429);
    expect(refusalKind(403, '<script src="https://ct.captcha-delivery.com/c.js">')).toBe(403);
    expect(refusalKind(403, '{"message":"not yours"}')).toBe(0);
    expect(refusalKind(401, '')).toBe(0);
  });
  it('doubles the pause per strike, capped at six hours', () => {
    expect(blockFor(429, 0)).toBe(15 * 60_000);
    expect(blockFor(429, 2)).toBe(60 * 60_000);
    expect(blockFor(403, 9)).toBe(6 * 3_600_000);
    expect(blockFor(429, 0, 40 * 60_000)).toBe(40 * 60_000);
  });
  it('reads Retry-After in both forms', () => {
    expect(retryAfterMs('120')).toBe(120_000);
    const now = Date.parse('2026-10-28T10:00:00Z');
    expect(retryAfterMs('Wed, 28 Oct 2026 10:05:00 GMT', now)).toBe(300_000);
    expect(retryAfterMs(null)).toBe(0);
  });
  it('waits until the oldest write in the window ages out', () => {
    const now = 10_000_000;
    const writes = Array.from({ length: 8 }, (_, i) => now - 50 * 60_000 + i * 60_000);
    expect(waitForCap(writes, now)).toBe(10 * 60_000);
    expect(waitForCap(writes.slice(1), now)).toBe(0);
  });
});

describe('sold pages', () => {
  it('reads schema.org availability', () => {
    expect(pageState('depop', 200, '{"@type":"Offer","availability":"https://schema.org/SoldOut"}')).toBe('sold');
    expect(pageState('grailed', 200, '{"availability":"http://schema.org/InStock"}')).toBe('live');
  });
  it('reads site-specific markers', () => {
    expect(pageState('poshmark', 200, '{"inventory_status":"sold_out"}')).toBe('sold');
    expect(pageState('mercari', 200, '{"status":"sold_out"}')).toBe('sold');
    expect(pageState('depop', 200, '<html>nothing</html>')).toBe('unknown');
  });
  it('treats 404 as gone and errors as unknown', () => {
    expect(pageState('depop', 404, '')).toBe('gone');
    expect(pageState('depop', 403, '')).toBe('unknown');
  });
  it('finds a price', () => {
    expect(pagePrice('{"price":"24.00","priceCurrency":"USD"}')).toBe(24);
  });
});
