import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.resetModules(); delete (globalThis as { chrome?: unknown }).chrome; });

async function waitingJob(link: string | null, sweep = false, marketplace = 'poshmark') {
  const job = { id: 'job-1', listing_id: 'listing-1', marketplace, kind: 'publish', attempts: 1 };
  const waiting = { job, tab_id: 42, listing_id: 'listing-1', marketplace, kind: 'post', title: 'Gildan Berkeley hoodie', pressed: true, stuck: sweep };
  const storage: Record<string, unknown> = { 'assist.waiting': { 'job-1': waiting } };
  (globalThis as { chrome?: unknown }).chrome = {
    storage: { local: {
      get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
      set: vi.fn(async (value: object) => Object.assign(storage, value)),
    } },
    tabs: {
      onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
      get: vi.fn(async () => ({ id: 42, status: 'complete', url: 'https://poshmark.com/closet/buyer341' })),
      sendMessage: vi.fn(async () => ({ url: link })),
    },
  };
  const patches: object[] = [];
  const rpc = vi.fn(async () => ({ error: null }));
  const cleanup = { eq: vi.fn(() => cleanup), in: vi.fn(() => cleanup), neq: vi.fn(async () => ({ error: null })) };
  const cancelOlder = vi.fn(() => cleanup);
  const sb = { rpc, from: vi.fn((table: string) => table === 'jobs' ? { update: cancelOlder } : ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'listing-1', relist_count: 0 } }) }) }),
    update: (patch: object) => ({ eq: async () => { patches.push(patch); return { error: null }; } }),
  })) };
  const { onTabUrl, sweepWaiting } = await import('../src/bg/jobs.ts');
  if (sweep) await sweepWaiting(sb as never);
  else await onTabUrl(sb as never, 42, 'https://poshmark.com/closet/buyer341');
  return { patches, rpc, storage, cancelOlder, cleanup };
}

describe('marketplace confirmation', () => {
  it('ignores work saved for a removed marketplace after an extension update', async () => {
    const { patches, rpc } = await waitingJob(null, true, 'facebook');
    expect(patches).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not mark an item live just because the tab redirected to the closet', async () => {
    const { patches, rpc, storage } = await waitingJob(null);
    expect(patches).toEqual([expect.objectContaining({ status: 'needs_action' })]);
    expect(rpc).toHaveBeenCalledWith('finish_job', expect.objectContaining({ p_status: 'needs_user' }));
    expect(storage['assist.waiting']).toMatchObject({ 'job-1': { stuck: true } });
  });

  it('records the actual listing link when that item is found on the closet', async () => {
    const link = 'https://poshmark.com/listing/Gildan-Berkeley-hoodie-65a123';
    const { patches, rpc, cancelOlder, cleanup } = await waitingJob(link);
    expect(patches).toEqual([expect.objectContaining({ status: 'listed', external_url: link, external_id: 'Gildan-Berkeley-hoodie-65a123', error: null })]);
    expect(rpc).toHaveBeenCalledWith('finish_job', expect.objectContaining({ p_status: 'done' }));
    expect(cancelOlder).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
    expect(cleanup.eq).toHaveBeenCalledWith('listing_id', 'listing-1');
    expect(cleanup.in).toHaveBeenCalledWith('kind', ['publish', 'relist']);
  });

  it('reconciles an already completed post after a worker reload even when an older driver marked it stuck', async () => {
    const link = 'https://poshmark.com/listing/Gildan-Berkeley-hoodie-65a123';
    const { patches, rpc, storage } = await waitingJob(link, true);
    expect(patches).toEqual([expect.objectContaining({ status: 'listed', external_url: link })]);
    expect(rpc).toHaveBeenCalledWith('finish_job', expect.objectContaining({ p_status: 'done' }));
    expect(storage['assist.waiting']).toEqual({});
  });
});

describe('finding the new listing after the site lands somewhere else', () => {
  it('looks in the seller’s Depop shop when the Done screen has no link, skipping their older listings', async () => {
    const job = { id: 'job-2', listing_id: 'listing-2', marketplace: 'depop', kind: 'publish', attempts: 1 };
    const waiting = { job, tab_id: 7, listing_id: 'listing-2', marketplace: 'depop', kind: 'post', title: 'Gildan hoodie', titles: ['UC Berkeley Graphic Pullover Hoodie'], pressed: true };
    const storage: Record<string, unknown> = { 'assist.waiting': { 'job-2': waiting } };
    const done = 'https://www.depop.com/products/create/success/?productId=977664326';
    const shop = 'https://www.depop.com/radiant_jar/';
    const link = 'https://www.depop.com/products/radiant_jor-uc-berkeley-graphic-pullover-hoodie-412d/';
    const asked: Array<Record<string, unknown>> = [];
    const update = vi.fn(async (_id: number, props: { url: string }) => ({ id: 7, url: props.url }));
    (globalThis as { chrome?: unknown }).chrome = {
      storage: { local: {
        get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
        set: vi.fn(async (value: object) => Object.assign(storage, value)),
      } },
      tabs: {
        onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
        get: vi.fn(async () => ({ id: 7, status: 'complete', url: done })),
        update,
        sendMessage: vi.fn(async (_id: number, msg: Record<string, unknown>) => {
          if (msg.type !== 'assist:find') return { ok: true };
          asked.push(msg);
          return asked.length === 1 ? { url: null, shop } : { url: link, shop: null };
        }),
      },
    };
    const patches: object[] = [];
    const known = ['https://www.depop.com/products/radiavt_jar-gildan-berkeley-california-graphic-pullover-035b/'];
    const listings = {
      select: (cols: string) => cols === 'external_url'
        ? { eq: () => ({ not: () => ({ limit: async () => ({ data: known.map(external_url => ({ external_url })) }) }) }) }
        : { eq: () => ({ maybeSingle: async () => ({ data: { id: 'listing-2', relist_count: 0 } }) }) },
      update: (patch: object) => ({ eq: async () => { patches.push(patch); return { error: null }; } }),
    };
    const cleanup = { eq: vi.fn(() => cleanup), in: vi.fn(() => cleanup), neq: vi.fn(async () => ({ error: null })) };
    const sb = { rpc: vi.fn(async () => ({ error: null })), from: vi.fn((table: string) => (table === 'jobs' ? { update: () => cleanup } : listings)) };
    const { onTabUrl } = await import('../src/bg/jobs.ts');
    await onTabUrl(sb as never, 7, done);
    expect(asked[0]).toMatchObject({ marketplace: 'depop', titles: ['UC Berkeley Graphic Pullover Hoodie'], exclude: known, product_id: '977664326' });
    expect(update).toHaveBeenCalledWith(7, { url: shop });
    expect(patches).toEqual([expect.objectContaining({ status: 'listed', external_url: link, error: null })]);
    expect(sb.rpc).toHaveBeenCalledWith('finish_job', expect.objectContaining({ p_status: 'done' }));
  }, 20_000);
});
