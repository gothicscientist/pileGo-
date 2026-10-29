import { expect, test } from '@playwright/test';
import { mockSupabase } from './fixtures';

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
  // The slider runs from selling fast to maximizing profit.
  const slider = page.getByRole('slider', { name: /sell fast to maximize profit/ });
  await expect(slider).toBeVisible();
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByText('eBay is not connected on this server yet')).toBeVisible();
  await slider.focus();
  await page.keyboard.press('Home');
  await expect(page.getByText('Likely sells within about a week')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use $34' })).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.getByRole('button', { name: 'Use $56' })).toBeVisible();
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
  await snap(page, 'scan', info.project.name);
});
