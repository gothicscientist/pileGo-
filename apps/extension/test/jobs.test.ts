import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.resetModules(); delete (globalThis as { chrome?: unknown }).chrome; });

async function waitingJob(link: string | null) {
  const job = { id: 'job-1', marketplace: 'poshmark', kind: 'publish', attempts: 1 };
  const waiting = { job, tab_id: 42, listing_id: 'listing-1', marketplace: 'poshmark', kind: 'post', title: 'Gildan Berkeley hoodie', pressed: true };
  const storage: Record<string, unknown> = { 'assist.waiting': { 'job-1': waiting } };
  (globalThis as { chrome?: unknown }).chrome = {
    storage: { local: {
      get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
      set: vi.fn(async (value: object) => Object.assign(storage, value)),
    } },
    tabs: {
      onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
      get: vi.fn(async () => ({ id: 42, status: 'complete' })),
      sendMessage: vi.fn(async () => ({ url: link })),
    },
  };
  const patches: object[] = [];
  const rpc = vi.fn(async () => ({ error: null }));
  const sb = { rpc, from: vi.fn(() => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'listing-1', relist_count: 0 } }) }) }),
    update: (patch: object) => ({ eq: async () => { patches.push(patch); return { error: null }; } }),
  })) };
  const { onTabUrl } = await import('../src/bg/jobs.ts');
  await onTabUrl(sb as never, 42, 'https://poshmark.com/closet/buyer341');
  return { patches, rpc, storage };
}

describe('marketplace confirmation', () => {
  it('does not mark an item live just because the tab redirected to the closet', async () => {
    const { patches, rpc, storage } = await waitingJob(null);
    expect(patches).toEqual([expect.objectContaining({ status: 'needs_action' })]);
    expect(rpc).toHaveBeenCalledWith('finish_job', expect.objectContaining({ p_status: 'needs_user' }));
    expect(storage['assist.waiting']).toMatchObject({ 'job-1': { stuck: true } });
  });

  it('records the actual listing link when that item is found on the closet', async () => {
    const link = 'https://poshmark.com/listing/Gildan-Berkeley-hoodie-65a123';
    const { patches, rpc } = await waitingJob(link);
    expect(patches).toEqual([expect.objectContaining({ status: 'listed', external_url: link, external_id: 'Gildan-Berkeley-hoodie-65a123', error: null })]);
    expect(rpc).toHaveBeenCalledWith('finish_job', expect.objectContaining({ p_status: 'done' }));
  });
});
