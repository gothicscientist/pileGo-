// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  callFunction: vi.fn().mockResolvedValue({ token_hash: 'one-time-link', email: 'seller@example.com' }),
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'public-key',
}));

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); sessionStorage.clear(); });

it('keeps the first List wake-up through linking and stops only after the worker acknowledges that request', async () => {
  vi.useFakeTimers();
  const post = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
  const { pokeExtension, setExtensionUser } = await import('./extension');
  setExtensionUser('seller-1');
  pokeExtension();
  const request = JSON.parse(sessionStorage.getItem('pilego-run-jobs')!);
  const status = (extra: object) => window.dispatchEvent(new MessageEvent('message', {
    source: window, origin: window.location.origin,
    data: { source: 'pilego-ext', type: 'status', status: extra },
  }));
  status({ installed: true, linked: false, user_id: null });
  await vi.advanceTimersByTimeAsync(2000);
  expect(post.mock.calls.filter(([data]) => data.type === 'run-jobs')).toHaveLength(2);
  expect(sessionStorage.getItem('pilego-run-jobs')).not.toBeNull();
  // An unrelated status or another seller must not consume the wake-up.
  status({ linked: true, user_id: 'seller-1', jobs_accepted: 'different-request' });
  status({ linked: true, user_id: 'seller-2', jobs_accepted: request.request_id });
  expect(sessionStorage.getItem('pilego-run-jobs')).not.toBeNull();
  status({ linked: true, user_id: 'seller-1', jobs_accepted: request.request_id });
  expect(sessionStorage.getItem('pilego-run-jobs')).toBeNull();
  const calls = post.mock.calls.length;
  await vi.advanceTimersByTimeAsync(10_000);
  expect(post).toHaveBeenCalledTimes(calls);
});
