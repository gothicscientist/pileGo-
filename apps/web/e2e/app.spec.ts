import { expect, test } from '@playwright/test';
import { mockSupabase, SUPABASE, UID } from './fixtures';

const shots = process.env.SCREENSHOTS;

async function snap(page: import('@playwright/test').Page, name: string, project: string) {
  if (shots) await page.screenshot({ path: `${shots}/${project}-${name}.png`, fullPage: true });
}

test('signed-out visitors see the sign-in floor', async ({ page }, info) => {
  await mockSupabase(page, { signedIn: false });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Clear the pile\. Keep the cash\./ })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  await snap(page, 'signin', info.project.name);
});

test('one List click on three marketplaces resumes after linking and a refresh without queuing again', async ({ page }) => {
  await mockSupabase(page);
  const queued: Array<{ p_marketplaces: string[] }> = [];
  await page.route(`${SUPABASE}/rest/v1/rpc/queue_publish`, route => {
    queued.push(route.request().postDataJSON());
    return route.fulfill({ contentType: 'application/json', body: '[]' });
  });
  await page.addInitScript(uid => {
    window.addEventListener('message', e => {
      if (e.data?.source !== 'pilego-app') return;
      const linked = sessionStorage.getItem('test-linked') === 'yes';
      if (e.data.type === 'run-jobs') {
        const requests = JSON.parse(sessionStorage.getItem('test-wakeups') ?? '[]');
        requests.push(e.data.request_id);
        sessionStorage.setItem('test-wakeups', JSON.stringify(requests));
      }
      if (!['hello', 'run-jobs'].includes(e.data.type)) return;
      window.postMessage({ source: 'pilego-ext', type: 'status', status: {
        version: '0.3.9', installed: true, linked, needs_approval: !linked,
        user_id: linked ? uid : null, tabs: {}, running: 0,
        ...(linked && e.data.type === 'run-jobs' ? { jobs_accepted: e.data.request_id } : {}),
      } }, location.origin);
    });
  }, UID);
  await page.goto('/item/a4?crosslist=1');
  const sheet = page.getByRole('dialog', { name: 'Cross-list', exact: true });
  await sheet.getByRole('button', { name: /eBay Automatic/ }).click();
  await sheet.getByRole('button', { name: 'List on 3 marketplaces', exact: true }).click();
  await expect(sheet).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('test-wakeups') ?? '[]').length)).toBeGreaterThan(1);
  await page.reload();
  await page.evaluate(() => { sessionStorage.setItem('test-linked', 'yes'); });
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pilego-run-jobs'))).toBeNull();
  expect(queued).toHaveLength(1);
  expect(queued[0]!.p_marketplaces).toEqual(['vinted', 'depop', 'poshmark']);
  const requests = await page.evaluate(() => JSON.parse(sessionStorage.getItem('test-wakeups') ?? '[]') as string[]);
  expect(new Set(requests).size).toBe(1);
});

test('the pile shows unsold pieces and the receipt', async ({ page }, info) => {
  await mockSupabase(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The pile' })).toBeVisible();
  const pile = page.getByRole('region', { name: 'The pile' });
  await expect(pile.getByRole('link', { name: /Raw selvedge straight jeans/ })).toBeVisible();
  await expect(page.getByText('Taken this month')).toBeVisible();
  // Sold more than a week ago: not on the pile, but the receipt says to ship it.
  await expect(pile.getByRole('link', { name: /Smiley graphic hoodie/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Ship Smiley graphic hoodie' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1400);
  await snap(page, 'pile', info.project.name);
});

test('an empty account gets a way to start', async ({ page }, info) => {
  await mockSupabase(page, { empty: true });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Start with one thing from the pile' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  await snap(page, 'pile-empty', info.project.name);
});

test('closet filters by status and search', async ({ page }, info) => {
  await mockSupabase(page);
  await page.goto('/closet');
  await expect(page.getByRole('heading', { name: 'Closet' })).toBeVisible();
  await expect(page.getByText('Colour block anorak')).toBeVisible();
  await page.waitForTimeout(500);
  await snap(page, 'closet', info.project.name);
  await page.getByPlaceholder('Search brand, title, SKU, colour').fill('bomber');
  await expect(page.getByText('Colour block anorak')).toHaveCount(0);
  await expect(page.getByText('Rust bomber jacket')).toBeVisible();
  await page.getByPlaceholder('Search brand, title, SKU, colour').fill('');
  await page.getByRole('tab', { name: /Sold/ }).first().click();
  await expect(page.getByText('Cord collar denim jacket')).toBeVisible();
  await page.goto('/closet?view=table');
  await expect(page.getByRole('table')).toBeVisible();
  await snap(page, 'closet-table', info.project.name);
});

test('item page shows listings, price and cross-list sheet', async ({ page }, info) => {
  await mockSupabase(page);
  await page.goto('/item/a1');
  await expect(page.getByRole('heading', { name: 'Raw selvedge straight jeans' })).toBeVisible();
  await page.waitForTimeout(500);
  await snap(page, 'item', info.project.name);
  await page.getByRole('tab', { name: 'Listings' }).click();
  await expect(page.getByText('View on eBay')).toBeVisible();
  await snap(page, 'item-listings', info.project.name);
  await page.getByRole('tab', { name: 'Price' }).click();
  await expect(page.getByText('Suggested price')).toBeVisible();
  await expect(page.getByText('What you keep')).toBeVisible();
  // Three prices to pick from, read from similar sales, and a box for any price.
  const picker = page.getByRole('radiogroup', { name: /Price: pick one/ });
  await expect(picker.getByRole('radio', { name: /Likely to sell \$38/ })).toBeVisible();
  await expect(picker.getByRole('radio', { name: /Balanced \$48/ })).toBeVisible();
  await expect(picker.getByRole('radio', { name: /Less likely \$60/ })).toBeVisible();
  await expect(page.getByText('In line with what similar pieces sell for.')).toBeVisible();
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByText('eBay is not connected on this server yet')).toBeVisible();
  await expect(picker.getByRole('radio', { name: /Less likely \$52/ })).toBeVisible();
  await expect(page.getByText(/6 on eBay, 4 on Poshmark/).first()).toBeVisible();
  const box = page.getByLabel('Price in USD');
  await box.fill('70');
  await expect(page.getByText('Your price is high. Try pricing at or below $52 to help your item sell.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use $70' })).toBeVisible();
  await picker.getByRole('radio', { name: /Likely to sell/ }).click();
  await expect(box).toHaveValue('38');
  await expect(page.getByRole('button', { name: 'Use $38' })).toBeVisible();
  await box.fill('');
  await box.fill('62');
  await snap(page, 'item-price', info.project.name);
  await page.getByRole('button', { name: 'Cross-list' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Cross-list' });
  await expect(dialog).toBeVisible();
  // eBay and Vinted are already live, so Depop and Poshmark are picked.
  await expect(dialog.getByRole('button', { name: /List on 2 marketplaces/ })).toBeVisible();
  await page.waitForTimeout(400);
  await snap(page, 'crosslist', info.project.name);
});

test('out there groups what needs attention', async ({ page }, info) => {
  await mockSupabase(page);
  await page.goto('/out');
  await expect(page.getByRole('heading', { name: 'Needs you' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Live' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Relist \d+ old listings/ })).toBeVisible();
  await snap(page, 'out', info.project.name);
});

test('insights adds up sales', async ({ page }, info) => {
  await mockSupabase(page);
  await page.goto('/insights');
  await page.getByRole('button', { name: 'All time' }).click();
  await expect(page.getByText('Profit after fees and what you paid')).toBeVisible();
  await expect(page.getByLabel('Sales by month, last 12 months')).toBeVisible();
  await snap(page, 'insights', info.project.name);
});

test('settings show marketplaces, eBay and extension', async ({ page }, info) => {
  await mockSupabase(page);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Where you sell' })).toBeVisible();
  for (const name of ['eBay', 'Vinted', 'Depop', 'Poshmark', 'Mercari', 'Grailed']) {
    await expect(page.getByRole('checkbox', { name: `Sell on ${name}`, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('checkbox', { name: /Sell on (Etsy|Vestiaire|Facebook)/ })).toHaveCount(0);
  await expect(page.getByText(/Connected as sam_resells/)).toBeVisible();
  await expect(page.getByText('Not installed in this browser')).toBeVisible();
  await snap(page, 'settings', info.project.name);
});

test('old marketplace preferences and listings do not break the closet or cross-listing', async ({ page }) => {
  await mockSupabase(page, { marketplaces: ['etsy', 'facebook', 'vestiaire', 'depop'], legacyMarketplace: 'facebook' });
  await page.goto('/closet');
  await expect(page.getByText('Raw selvedge straight jeans', { exact: true }).first()).toBeVisible();
  await page.goto('/item/a4?crosslist=1');
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('button', { name: 'List on 1 marketplace', exact: true })).toBeVisible();
  await expect(sheet.getByText(/Etsy|Vestiaire|Facebook/)).toHaveCount(0);
});

test('scan page offers camera and file pickers', async ({ page }, info) => {
  await mockSupabase(page);
  await page.goto('/scan');
  await expect(page.getByRole('heading', { name: 'Scan an item' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scan with AI' })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Add the front photo/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Add the back photo/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Add the label photo/ })).toBeVisible();
  await expect(page.getByTestId('shot-count')).toHaveText('0 of 3');
  await snap(page, 'scan', info.project.name);
});

test('the extension page offers both downloads and says when it is missing', async ({ page }, info) => {
  await mockSupabase(page, { signedIn: false });
  await page.goto('/extension');
  await expect(page.getByRole('heading', { name: 'Get the browser extension' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download for Chrome, Edge or Brave' })).toHaveAttribute('href', '/downloads/pilego-extension-chrome.zip');
  await expect(page.getByRole('link', { name: 'Download for Firefox' })).toHaveAttribute('href', '/downloads/pilego-extension-firefox.zip');
  await expect(page.getByTestId('extension-status')).toContainText('Not detected in this browser');
  await snap(page, 'extension', info.project.name);
});

test('an installed extension shows up on the extension page', async ({ page }) => {
  await mockSupabase(page, { signedIn: false });
  // Stands in for the extension's content script.
  await page.addInitScript(() => {
    window.addEventListener('message', e => {
      if (e.data?.source !== 'pilego-app') return;
      window.postMessage(
        { source: 'pilego-ext', type: 'status', status: { installed: true, version: '0.1.0', tabs: {}, running: 0, linked: false, user_id: null } },
        location.origin,
      );
    });
  });
  await page.goto('/extension');
  const status = page.getByTestId('extension-status');
  await expect(status).toContainText('Installed. Sign in to link it');
  await expect(status).toContainText(/Version 0\.1\.0\. Version \d+\.\d+\.\d+ is out/);
});

test('extension setup resumes the listing with its selections and edits after a refresh', async ({ page }, info) => {
  await mockSupabase(page);
  // Stand in for the content script, including after refreshing the install tab.
  await page.addInitScript(() => {
    window.addEventListener('message', e => {
      if (e.data?.source !== 'pilego-app' || e.data.type !== 'hello') return;
      const status = JSON.parse(sessionStorage.getItem('test-extension-status') ?? 'null');
      if (status) window.postMessage({ source: 'pilego-ext', type: 'status', status }, location.origin);
    });
  });
  await page.goto('/item/a1?tab=listings&crosslist=1');
  let dialog = page.getByRole('dialog', { name: 'Cross-list', exact: true });
  await dialog.getByRole('tab', { name: 'Poshmark', exact: true }).click();
  await dialog.getByLabel('Title', { exact: true }).fill('My edited jeans title');
  await dialog.getByLabel('Price (USD)').fill('39');
  await dialog.getByLabel('Description', { exact: true }).fill('My edited listing description');
  await dialog.getByRole('button', { name: /Depop/ }).click();
  await dialog.getByRole('button', { name: 'More marketplaces' }).click();
  await dialog.getByRole('link', { name: 'Get the extension' }).click();
  await expect(page.getByRole('link', { name: 'Back to listing' })).toHaveAttribute('href', '/item/a1?tab=listings&crosslist=1');
  await page.reload();
  await expect(page.getByText(/we’ll take you straight back to continue/)).toBeVisible();
  await snap(page, 'extension-return', info.project.name);

  const report = async (linked: boolean, needs_approval: boolean, user_id: string | null) => {
    await page.evaluate(status => {
      sessionStorage.setItem('test-extension-status', JSON.stringify(status));
      window.postMessage({ source: 'pilego-ext', type: 'status', status }, location.origin);
    }, { installed: true, version: '1.0.0', tabs: {}, running: 0, linked, needs_approval, user_id });
  };
  // Installation alone, pending approval and a different account cannot resume.
  await report(false, false, null);
  await expect(page.getByTestId('extension-status')).toContainText('Installed, linking');
  await expect(page).toHaveURL(/\/extension\?/);
  await report(true, true, UID);
  await expect(page.getByTestId('extension-status')).toContainText('It needs your OK');
  await expect(page).toHaveURL(/\/extension\?/);
  await report(true, false, 'another-seller');
  await expect(page.getByTestId('extension-status')).toContainText('Installed and linked');
  await expect(page).toHaveURL(/\/extension\?/);
  await report(true, false, UID);
  await expect(page).toHaveURL('/item/a1?tab=listings&crosslist=1');
  dialog = page.getByRole('dialog', { name: 'Cross-list', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'List on 1 marketplace', exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('My edited jeans title');
  await expect(dialog.getByLabel('Price (USD)')).toHaveValue('39');
  await expect(dialog.getByLabel('Description', { exact: true })).toHaveValue('My edited listing description');
  await expect(dialog.getByRole('button', { name: 'Only my marketplaces' })).toBeVisible();
  await snap(page, 'crosslist-resumed', info.project.name);

  // Setup must never submit or queue a listing on the seller’s behalf.
  await expect(page.getByRole('button', { name: 'List on 1 marketplace', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Cross-list', exact: true }).first().click();
  await expect(dialog.getByRole('button', { name: 'List on 2 marketplaces', exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Description', { exact: true })).not.toHaveValue('My edited listing description');
});

test('the extension page can return to the listing before installation finishes', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/item/a1?crosslist=1');
  await page.getByRole('dialog', { name: 'Cross-list', exact: true }).getByRole('link', { name: 'Get the extension' }).click();
  await page.getByRole('link', { name: 'Back to listing' }).click();
  await expect(page.getByRole('dialog', { name: 'Cross-list', exact: true })).toBeVisible();
});

test('extension setup from Settings returns to Settings', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/settings#extension');
  await page.getByRole('region', { name: 'Browser extension', exact: true }).getByRole('link', { name: 'Get the extension' }).click();
  await expect(page.getByRole('link', { name: 'Back to where you left off' })).toHaveAttribute('href', '/settings#extension');
  await page.evaluate(user_id => window.postMessage({
    source: 'pilego-ext', type: 'status',
    status: { installed: true, linked: true, user_id, needs_approval: false },
  }, location.origin), UID);
  await expect(page).toHaveURL('/settings#extension');
});

test('the sidebar extension link remembers the current item and tab', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'The extension shortcut is in the desktop rail.');
  await mockSupabase(page);
  await page.goto('/item/a1?tab=price');
  await page.getByRole('complementary').getByRole('link', { name: 'Get the extension' }).click();
  await expect(page.getByRole('link', { name: 'Back to listing' })).toHaveAttribute('href', '/item/a1?tab=price');
  await page.evaluate(user_id => window.postMessage({
    source: 'pilego-ext', type: 'status',
    status: { installed: true, linked: true, user_id, needs_approval: false },
  }, location.origin), UID);
  await expect(page).toHaveURL('/item/a1?tab=price');
  await expect(page.getByRole('tab', { name: 'Price', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('scan sends photo roles and marks measurement estimates', async ({ page }, info) => {
  await mockSupabase(page);
  await page.addInitScript(() => window.localStorage.setItem('pilego-cutouts', 'off'));
  let sent: { roles?: string[]; unit?: string; photos?: string[] } | null = null;
  await page.route(`${SUPABASE}/functions/v1/scan-item`, async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    sent = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        title: 'Hanes plain white crewneck tee', brand: 'Hanes', department: 'men', category: 'tops', subcategory: null, size: 'M',
        size_system: 'letter', colors: ['white'], materials: ['100% cotton'], condition: 'good', flaws: null, era: null,
        style_tags: ['basics'], description: 'A plain white tee.', keywords: [], price: { low: 4, high: 10, suggested: 6, currency: 'USD' },
        measurements_to_take: ['pit_to_pit', 'length'], confidence: 0.9, notes: null,
        estimated_measurements: { unit: 'in', basis: 'Size M on a standard US chart', pit_to_pit: 20, length: 28, shoulder: 18, sleeve: 8 },
      }),
    });
  });
  await page.goto('/scan');
  await expect(page.getByTestId('shot-count')).toHaveText('0 of 3');
  const jpeg = await page.screenshot({ type: 'jpeg', clip: { x: 0, y: 0, width: 160, height: 200 } });

  for (const [slot, name] of [['front', 'front.jpg'], ['label', 'label.jpg']] as const) {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: new RegExp(`Add the ${slot} photo`) }).click();
    await (await chooser).setFiles({ name, mimeType: 'image/jpeg', buffer: jpeg });
  }
  await expect(page.getByTestId('shot-count')).toHaveText('2 of 3');
  await expect(page.getByTestId('missing-shots')).toContainText('No back photo yet');
  await expect(page.getByRole('button', { name: 'Scan with AI' })).toBeEnabled();
  await snap(page, 'scan-photos', info.project.name);

  await page.getByRole('button', { name: 'Scan with AI' }).click();
  await expect(page.getByRole('heading', { name: 'Check it over' })).toBeVisible();
  expect(sent!.roles).toEqual(['front', 'label']);
  expect(sent!.unit).toBe('in');
  expect(sent!.photos).toHaveLength(2);

  await expect(page.getByTestId('estimate-note')).toContainText('size M on a standard US chart');
  const pit = page.getByLabel(/Pit to pit/);
  await expect(pit).toHaveValue('20');
  await expect(pit).toHaveClass(/field-estimate/);
  await expect(page.getByText('AI est.')).toHaveCount(4);
  await snap(page, 'scan-review', info.project.name);

  // Measuring one by hand makes it the seller's own.
  await pit.fill('21');
  await expect(pit).not.toHaveClass(/field-estimate/);
  await expect(page.getByText('AI est.')).toHaveCount(3);
  await page.getByRole('button', { name: 'Clear the estimates' }).click();
  await expect(page.getByLabel(/Length/)).toHaveValue('');
  await expect(pit).toHaveValue('21');
  await expect(page.getByTestId('estimate-note')).toHaveCount(0);
});

test('a computer can hand the scan photos to a phone with a QR code', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'The phone button is for computers.');
  await mockSupabase(page);
  await page.addInitScript(() => window.localStorage.setItem('pilego-cutouts', 'off'));
  const jpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
    'base64',
  );
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  let session: { id: string; item_id: string } | null = null;
  let polls = 0;
  await page.route(`${SUPABASE}/rest/v1/phone_sessions**`, async route => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (req.method() === 'POST') {
      session = req.postDataJSON();
      return route.fulfill({ status: 201, contentType: 'application/json', headers: cors, body: JSON.stringify({ expires_at: new Date(Date.now() + 3600_000).toISOString() }) });
    }
    if (req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ opened_at: polls > 0 ? new Date().toISOString() : null, expires_at: new Date(Date.now() + 3600_000).toISOString() }) });
    }
    return route.fulfill({ status: 204, headers: cors });
  });
  // The phone sends the front, then the label.
  await page.route(`${SUPABASE}/rest/v1/phone_photos**`, async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    polls += 1;
    const rows = [
      { id: '00000000-0000-4000-8000-0000000000f1', item_id: session!.item_id, path: `${UID}/${session!.item_id}/f1.jpg`, role: 'front', width: 1, height: 1 },
      { id: '00000000-0000-4000-8000-0000000000f2', item_id: session!.item_id, path: `${UID}/${session!.item_id}/f2.jpg`, role: 'label', width: 1, height: 1 },
    ].slice(0, Math.max(0, polls - 1));
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(rows) });
  });
  await page.route(`${SUPABASE}/storage/v1/object/photos/**`, route =>
    route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'image/jpeg', body: jpeg, headers: cors }) : route.fallback(),
  );

  await page.goto('/scan');
  await expect(page.getByRole('button', { name: 'Take photos' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Use my phone' }).click();
  const sheet = page.getByRole('dialog', { name: 'Take the photos on your phone' });
  await expect(sheet.getByRole('img', { name: 'QR code for the phone camera' })).toBeVisible();
  // The test server is on localhost, which a phone cannot open.
  await expect(sheet.getByTestId('phone-local')).toContainText('localhost');
  await expect(sheet.getByTestId('phone-status')).toContainText('Phone connected', { timeout: 10_000 });
  await snap(page, 'scan-phone', info.project.name);
  await expect(sheet.getByTestId('phone-received')).toHaveText('2 photos from your phone.', { timeout: 15_000 });
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('shot-count')).toHaveText('2 of 3');
  await expect(page.getByTestId('missing-shots')).toContainText('No back photo yet');
  expect(session!.id).toMatch(/^[0-9a-f-]{36}$/);
});

test('the phone page sends each photo to the computer', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'The capture page is for phones.');
  await mockSupabase(page, { signedIn: false });
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  const roles: string[] = [];
  await page.route(`${SUPABASE}/functions/v1/phone-capture`, async route => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const type = req.headers()['content-type'] ?? '';
    if (type.startsWith('multipart/form-data')) {
      const body = req.postDataBuffer()!.toString('latin1');
      expect(body).toContain('11111111-2222-4333-8444-555555555555');
      roles.push(/name="role"\r\n\r\n(\w+)/.exec(body)![1]!);
      return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ id: `p${roles.length}`, role: roles.at(-1) }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ item_id: 'item-1', expires_at: new Date(Date.now() + 3600_000).toISOString(), count: 0 }) });
  });

  await page.goto('/phone/11111111-2222-4333-8444-555555555555');
  await expect(page.getByRole('heading', { name: 'Snap it' })).toBeVisible();
  const jpeg = await page.screenshot({ type: 'jpeg', clip: { x: 0, y: 0, width: 160, height: 200 } });
  await snap(page, 'phone-capture', info.project.name);

  let chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Take the front photo', exact: true }).click();
  await (await chooser).setFiles({ name: 'front.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(page.getByTestId('phone-sent')).toContainText('1 sent');
  // The big button moves on to the next slot.
  chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Take the back photo', exact: true }).click();
  await (await chooser).setFiles({ name: 'back.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(page.getByTestId('phone-sent')).toContainText('2 sent');
  expect(roles).toEqual(['front', 'back']);
  await expect(page.getByRole('button', { name: 'Retake the front photo' })).toBeVisible();
  await snap(page, 'phone-capture-sent', info.project.name);
});

test('a closed phone code says so', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'The capture page is for phones.');
  await mockSupabase(page, { signedIn: false });
  await page.route(`${SUPABASE}/functions/v1/phone-capture`, route =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ error: 'This code was closed on your computer. Make a new one from the scan page.' }),
    }),
  );
  await page.goto('/phone/11111111-2222-4333-8444-555555555555');
  await expect(page.getByRole('heading', { name: 'This code no longer works' })).toBeVisible();
  await expect(page.getByText('This code was closed on your computer')).toBeVisible();
});

