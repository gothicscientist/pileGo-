import { expect, test } from '@playwright/test';
import { mockSupabase, SUPABASE } from './fixtures';

const shots = process.env.SCREENSHOTS;

async function snap(page: import('@playwright/test').Page, name: string, project: string) {
  if (shots) await page.screenshot({ path: `${shots}/${project}-${name}.png`, fullPage: true });
}

test('signed-out visitors see the sign-in floor', async ({ page }, info) => {
  await mockSupabase(page, { signedIn: false });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Turn the pile on your chair/ })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await page.waitForTimeout(900);
  await snap(page, 'signin', info.project.name);
});

test('the pile shows unsold pieces and the receipt', async ({ page }, info) => {
  await mockSupabase(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The pile' })).toBeVisible();
  const pile = page.getByRole('region', { name: 'The pile' });
  await expect(pile.getByRole('link', { name: /Levi's 501 straight leg jeans/ })).toBeVisible();
  await expect(page.getByText('Taken this month')).toBeVisible();
  // Sold more than a week ago: not on the pile, but the receipt says to ship it.
  await expect(pile.getByRole('link', { name: /Stussy 8 ball hoodie/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Ship Stussy 8 ball hoodie' })).toBeVisible();
  await page.waitForTimeout(1200);
  await snap(page, 'pile', info.project.name);
});

test('an empty account gets a way to start', async ({ page }, info) => {
  await mockSupabase(page, { empty: true });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Start with one thing from the pile' })).toBeVisible();
  await snap(page, 'pile-empty', info.project.name);
});

test('closet filters by status and search', async ({ page }, info) => {
  await mockSupabase(page);
  await page.goto('/closet');
  await expect(page.getByRole('heading', { name: 'Closet' })).toBeVisible();
  await expect(page.getByText("Arc'teryx Beta shell jacket")).toBeVisible();
  await page.waitForTimeout(500);
  await snap(page, 'closet', info.project.name);
  await page.getByPlaceholder('Search brand, title, SKU, colour').fill('carhartt');
  await expect(page.getByText("Arc'teryx Beta shell jacket")).toHaveCount(0);
  await expect(page.getByText('Carhartt Detroit jacket, brown duck canvas')).toBeVisible();
  await page.getByPlaceholder('Search brand, title, SKU, colour').fill('');
  await page.getByRole('tab', { name: /Sold/ }).first().click();
  await expect(page.getByText('Dr. Martens 1460 boots')).toBeVisible();
  await page.goto('/closet?view=table');
  await expect(page.getByRole('table')).toBeVisible();
  await snap(page, 'closet-table', info.project.name);
});

test('item page shows listings, price and cross-list sheet', async ({ page }, info) => {
  await mockSupabase(page);
  await page.goto('/item/a1');
  await expect(page.getByRole('heading', { name: "Levi's 501 straight leg jeans" })).toBeVisible();
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
  await expect(page.getByText(/Connected as sam_resells/)).toBeVisible();
  await expect(page.getByText('Not installed in this browser')).toBeVisible();
  await snap(page, 'settings', info.project.name);
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
