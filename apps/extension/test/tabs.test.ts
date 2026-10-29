import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe('Chrome tab mutations', () => {
  it('opens the marketplace after Chrome releases its temporary tab lock', async () => {
    vi.useFakeTimers();
    const create = vi.fn()
      .mockRejectedValueOnce(new Error('Tabs cannot be edited right now (user may be dragging a tab).'))
      .mockRejectedValueOnce(new Error('Tabs cannot be edited right now (user may be dragging a tab).'))
      .mockResolvedValue({ id: 42 });
    (globalThis as { chrome?: unknown }).chrome = { tabs: { create } };
    const { createTab } = await import('../src/bg/tabs.ts');
    const result = createTab({ url: 'https://poshmark.com/create-listing', active: true });
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual({ id: 42 });
    expect(create).toHaveBeenCalledTimes(3);
    expect(create.mock.calls.every(([args]) => args.url === 'https://poshmark.com/create-listing')).toBe(true);
  });

  it('does not retry permanent errors or pretend navigation succeeded', async () => {
    const update = vi.fn().mockRejectedValue(new Error('No tab with id: 42.'));
    (globalThis as { chrome?: unknown }).chrome = { tabs: { update } };
    const { updateTab } = await import('../src/bg/tabs.ts');
    await expect(updateTab(42, { url: 'https://poshmark.com/create-listing' })).rejects.toThrow('No tab');
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('eventually surfaces a persistent tab lock instead of silently giving up', async () => {
    vi.useFakeTimers();
    const update = vi.fn().mockRejectedValue(new Error('Tabs cannot be edited right now (user may be dragging a tab).'));
    (globalThis as { chrome?: unknown }).chrome = { tabs: { update } };
    const { updateTab } = await import('../src/bg/tabs.ts');
    const result = expect(updateTab(42, { active: true })).rejects.toThrow('Tabs cannot be edited');
    await vi.runAllTimersAsync();
    await result;
    expect(update).toHaveBeenCalledTimes(8);
  });
});
