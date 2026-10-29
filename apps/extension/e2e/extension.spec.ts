import { expect, tabId, test, work } from './fixtures.ts';

const VINTED = 'https://www.vinted.co.uk';

const catalogs = [
  {
    id: 1904,
    title: 'Women',
    catalogs: [{ id: 4, title: 'Clothing', catalogs: [{ id: 1037, title: 'Outerwear', catalogs: [{ id: 1907, title: 'Jackets' }, { id: 2525, title: 'Denim jackets' }] }] }],
  },
  { id: 5, title: 'Men', catalogs: [{ id: 2050, title: 'Clothing', catalogs: [{ id: 77, title: 'T-shirts' }] }] },
];

test.describe('Vinted', () => {
  test('publishes a draft through the page, with the size, brand and catalog matched', async ({ context, worker }) => {
    const seen: Array<{ method: string; path: string; headers: Record<string, string>; body: string | null }> = [];
    await context.addCookies([{ name: 'v_uid', value: '4242', domain: 'www.vinted.co.uk', path: '/' }]);
    await context.route(`${VINTED}/**`, async route => {
      const req = route.request();
      const url = new URL(req.url());
      seen.push({ method: req.method(), path: url.pathname + url.search, headers: req.headers(), body: req.postData() });
      const json = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
      if (!url.pathname.startsWith('/api/')) {
        return route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><html><head><title>Vinted</title></head><body><script>window.cfg={"CSRF_TOKEN":"tok-123"}</script><h1>Wardrobe</h1></body></html>',
        });
      }
      if (url.pathname === '/api/v2/item_upload/catalogs') return json({ catalogs });
      if (url.pathname === '/api/v2/item_upload/brands') return json({ brands: [{ id: 10, title: 'Levi’s' }, { id: 11, title: 'Levi’s Vintage' }] });
      if (url.pathname === '/api/v2/item_upload/size_groups') return json({ size_groups: [{ id: 4, sizes: [{ id: 206, title: 'S / 36 / 8' }, { id: 207, title: 'M / 38 / 10' }] }] });
      if (url.pathname === '/api/v2/item_upload/colors') return json({ colors: [{ id: 9, title: 'Blue' }, { id: 1, title: 'Black' }] });
      if (url.pathname === '/api/v2/photos') return json({ id: 501, orientation: 0 });
      if (url.pathname === '/api/v2/item_upload/drafts') return json({ draft: { id: 777 } });
      if (url.pathname === '/api/v2/item_upload/drafts/777/completion') return json({ item: { id: 888, url: '/items/888-levis-denim-jacket' } });
      return route.fulfill({ status: 404, body: '{}' });
    });

    const page = await context.newPage();
    await page.goto(`${VINTED}/member/4242`);
    const id = await tabId(worker, `${VINTED}/*`);
    const out = await worker.evaluate(({ id, work }) => chrome.tabs.sendMessage(id, { type: 'vinted:publish', work }), { id, work: work() });

    expect(out).toMatchObject({ status: 'listed', external_id: '888', url: `${VINTED}/items/888-levis-denim-jacket` });
    expect((out as { learned: Record<string, unknown> }).learned).toEqual({ 'catalog:women/outerwear/denim-jackets': 2525, 'brand:levi’s': 10 });

    const draft = seen.find(s => s.path === '/api/v2/item_upload/drafts')!;
    expect(draft.method).toBe('POST');
    expect(draft.headers['x-csrf-token']).toBe('tok-123');
    const sent = JSON.parse(draft.body!).draft;
    expect(sent).toMatchObject({ catalog_id: 2525, brand_id: 10, size_id: 207, color_ids: [9], status_id: 3, price: 32, assigned_photos: [{ id: 501, orientation: 0 }] });

    const done = JSON.parse(seen.find(s => s.path.endsWith('/completion'))!.body!);
    expect(done.draft.id).toBe(777);
    expect(done.draft.photos).toEqual([{ id: 501, orientation: 0 }]);
    expect(done.draft.assigned_photos).toBeUndefined();
    const upload = seen.find(s => s.path === '/api/v2/photos')!;
    expect(upload.headers['content-type']).toMatch(/multipart\/form-data/);
  });

  test('keeps the draft and hands over to the seller when no category matches', async ({ context, worker }) => {
    await context.addCookies([{ name: 'v_uid', value: '4242', domain: 'www.vinted.co.uk', path: '/' }]);
    let completed = false;
    await context.route(`${VINTED}/**`, async route => {
      const url = new URL(route.request().url());
      const json = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
      if (!url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'text/html', body: '<html><body><script>x={"CSRF_TOKEN":"t"}</script></body></html>' });
      if (url.pathname === '/api/v2/item_upload/catalogs') return json({ catalogs });
      if (url.pathname === '/api/v2/photos') return json({ id: 1 });
      if (url.pathname === '/api/v2/item_upload/drafts') return json({ draft: { id: 31 } });
      if (url.pathname.endsWith('/completion')) {
        completed = true;
        return json({ item: { id: 1 } });
      }
      return json({});
    });
    const page = await context.newPage();
    await page.goto(`${VINTED}/`);
    const id = await tabId(worker, `${VINTED}/*`);
    const out = await worker.evaluate(
      ({ id, work }) => chrome.tabs.sendMessage(id, { type: 'vinted:publish', work }),
      { id, work: work({ item: { ...work().item, category: 'shoes', subcategory: 'boots', brand: null, size: null } }) },
    );
    expect(out).toMatchObject({ status: 'needs_user', url: `${VINTED}/items/31/edit`, draft_id: '31' });
    expect(completed).toBe(false);
  });

  test('stops for a while after a rate limit', async ({ context, worker }) => {
    await context.addCookies([{ name: 'v_uid', value: '4242', domain: 'www.vinted.co.uk', path: '/' }]);
    await context.route(`${VINTED}/**`, async route => {
      const url = new URL(route.request().url());
      if (!url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'text/html', body: '<html><body><script>x={"CSRF_TOKEN":"t"}</script></body></html>' });
      return route.fulfill({ status: 429, headers: { 'retry-after': '1200' }, body: '{}' });
    });
    const page = await context.newPage();
    await page.goto(`${VINTED}/`);
    const id = await tabId(worker, `${VINTED}/*`);
    const out = await worker.evaluate(({ id }) => chrome.tabs.sendMessage(id, { type: 'vinted:delist', external_id: '5' }), { id });
    expect(out).toMatchObject({ status: 'failed', blocked: true });
    const block = (await worker.evaluate(async () => (await chrome.storage.local.get('pace.vinted.block'))['pace.vinted.block'])) as {
      why: string;
      until: number;
    };
    expect(block.why).toBe('rate_limit');
    expect(block.until - Date.now()).toBeGreaterThan(19 * 60_000);
  });
});

test('fills the Depop sell form and shows the panel', async ({ context, worker }) => {
  await context.route('https://www.depop.com/**', route =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body><form>
        <input type="file" accept="image/*" multiple id="photos" />
        <label for="d">Description</label><textarea id="d" name="description"></textarea>
        <label>Brand <input name="brand" id="b" /></label>
        <label>Price <input name="priceAmount" id="p" /></label>
      </form>
      <script>
        window.events = [];
        document.querySelector('textarea').addEventListener('input', e => window.events.push('desc:' + e.target.value.length));
      </script></body></html>`,
    }),
  );
  const page = await context.newPage();
  await page.goto('https://www.depop.com/products/create/');
  const id = await tabId(worker, 'https://www.depop.com/*');
  const listing = { ...work().listing, marketplace: 'depop', title: '', description: 'Levi’s denim trucker jacket\n\nMid-wash.\n\n#levis #denim' };
  const out = await worker.evaluate(
    ({ id, work }) => chrome.tabs.sendMessage(id, { type: 'assist:fill', work }),
    { id, work: work({ marketplace: 'depop', listing }) },
  );
  expect(out).toMatchObject({ ok: true, photos: 1 });
  expect((out as { filled: string[] }).filled.sort()).toEqual(['brand', 'description', 'price']);
  await expect(page.locator('#d')).toHaveValue(listing.description);
  await expect(page.locator('#p')).toHaveValue('32');
  await expect(page.locator('#b')).toHaveValue('Levi’s');
  expect(await page.evaluate(() => (document.getElementById('photos') as HTMLInputElement).files?.length)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { events: string[] }).events.length)).toBeGreaterThan(0);
  await expect(page.locator('pilego-panel')).toHaveCount(1);
});

test.describe('linking', () => {
  async function appPage(context: import('@playwright/test').BrowserContext, origin: string) {
    await context.route(`${origin}/**`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>pileGo</body></html>' }));
    const page = await context.newPage();
    await page.goto(`${origin}/`);
    return page;
  }

  const ask = (type: string, extra: Record<string, unknown> = {}) =>
    new Promise(resolve => {
      window.addEventListener('message', e => {
        if (e.data?.source === 'pilego-ext' && e.data.type === 'status') resolve(e.data.status);
      });
      window.postMessage({ source: 'pilego-app', type, ...extra }, location.origin);
    });

  test('the app at a trusted origin sees the extension', async ({ context }) => {
    const page = await appPage(context, 'http://localhost:5173');
    const status = await page.evaluate(ask, 'hello');
    expect(status).toMatchObject({ installed: true, linked: false, needs_approval: false });
    expect(status).toHaveProperty('tabs');
  });

  test('the production app at pilego.app is trusted out of the box', async ({ context }) => {
    const page = await appPage(context, 'https://pilego.app');
    const status = await page.evaluate(ask, 'hello');
    expect(status).toMatchObject({ installed: true, linked: false, needs_approval: false });
    expect(status).toHaveProperty('tabs');
  });

  test('reads sold prices from eBay for the app', async ({ context }) => {
    const searches: string[] = [];
    await context.route('https://www.ebay.com/**', route => {
      searches.push(route.request().url());
      return route.fulfill({
        contentType: 'text/html',
        body: `<ul class="srp-results">
          <li class="s-card s-card--horizontal"><a class="su-link" href="https://www.ebay.com/itm/396112233445?x=1">
            <div class="s-card__title"><span>GAP Arch Logo Hoodie Brown M</span></div></a>
            <div class="s-card__attribute-row"><span class="su-styled-text positive bold large-1 s-card__price">$21.50</span></div></li>
        </ul>`,
      });
    });
    const page = await appPage(context, 'https://pilego.app');
    const reply = await page.evaluate(
      () =>
        new Promise(resolve => {
          window.addEventListener('message', e => {
            if (e.data?.source === 'pilego-ext' && e.data.type === 'sold-comps' && e.data.request_id === 'r1') resolve(e.data);
          });
          window.postMessage({ source: 'pilego-app', type: 'sold-comps', request_id: 'r1', query: 'gap arch hoodie', region: 'US' }, location.origin);
        }),
    );
    expect(reply).toMatchObject({
      request_id: 'r1',
      comps: [{ source: 'ebay', title: 'GAP Arch Logo Hoodie Brown M', price: 21.5, currency: 'USD', url: 'https://www.ebay.com/itm/396112233445', sold: true }],
    });
    expect(searches).toHaveLength(1);
    expect(new URL(searches[0]!).searchParams.get('LH_Sold')).toBe('1');
  });

  test('an unknown app cannot use the browser to read eBay', async ({ context }) => {
    const page = await appPage(context, 'https://someone-else.pages.dev');
    const reply = await page.evaluate(
      () =>
        new Promise(resolve => {
          window.addEventListener('message', e => {
            if (e.data?.source === 'pilego-ext' && e.data.type === 'sold-comps') resolve(e.data);
          });
          window.postMessage({ source: 'pilego-app', type: 'sold-comps', request_id: 'r2', query: 'gap arch hoodie', region: 'US' }, location.origin);
        }),
    );
    expect(reply).toMatchObject({ request_id: 'r2', comps: null });
  });

  test('an unknown pages.dev app has to be approved in the popup', async ({ context, worker }) => {
    const page = await appPage(context, 'https://someone-else.pages.dev');
    const link = {
      token_hash: 'abc',
      email: 'seller@example.com',
      user_id: 'u1',
      supabase_url: 'https://attacker.supabase.co',
      anon_key: 'k',
      app_url: 'https://someone-else.pages.dev',
    };
    await page.evaluate(([fn, l]) => new Function(`return (${fn})`)()('link', l), [ask.toString(), link] as const).catch(() => {});
    const status = await page.evaluate(ask, 'hello');
    expect(status).toMatchObject({ installed: true, linked: false, needs_approval: true, user_id: null });
    const stored = (await worker.evaluate(async () => ({
      pending: (await chrome.storage.local.get('pending_link')).pending_link,
      config: (await chrome.storage.local.get('config')).config,
    }))) as { pending: { origin: string }; config?: unknown };
    expect(stored.pending.origin).toBe('https://someone-else.pages.dev');
    expect(stored.config).toBeUndefined();
    const badge = await worker.evaluate(() => chrome.action.getBadgeText({}));
    expect(badge).toBe('!');
  });
});
