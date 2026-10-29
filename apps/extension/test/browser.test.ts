import { afterEach, describe, expect, it, vi } from 'vitest';

// A content script left behind by an extension reload: runtime.id is gone and
// sendMessage throws instead of returning a promise.
function fakeChrome(id: string | undefined, sendMessage: () => unknown) {
  (globalThis as { chrome?: unknown }).chrome = { runtime: { id, sendMessage } };
}

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
  vi.resetModules();
});

describe('send', () => {
  it('stays quiet in a script orphaned by an extension reload', async () => {
    const sendMessage = vi.fn(() => {
      throw new Error('Extension context invalidated.');
    });
    fakeChrome(undefined, sendMessage);
    const { alive, send } = await import('../src/shared/browser.ts');
    expect(alive()).toBe(false);
    await expect(send({ type: 'app:hello' })).resolves.toBeUndefined();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('turns a thrown sendMessage into no answer', async () => {
    fakeChrome('abc', () => {
      throw new Error('Extension context invalidated.');
    });
    const { send } = await import('../src/shared/browser.ts');
    await expect(send({ type: 'app:hello' })).resolves.toBeUndefined();
  });

  it('passes the worker’s answer through', async () => {
    fakeChrome('abc', () => Promise.resolve({ linked: true }));
    const { send } = await import('../src/shared/browser.ts');
    await expect(send({ type: 'app:hello' })).resolves.toEqual({ linked: true });
  });
});
