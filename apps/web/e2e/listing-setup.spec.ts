import { expect, test } from '@playwright/test';
import { mockSupabase, SUPABASE, UID } from './fixtures';

function sellerProfile() {
  return {
    id: UID, display_name: 'Sam', currency: 'USD', region: 'US', measurement_unit: 'in',
    voice: { tone: 'friendly', sign_off: 'Ships next day.', always_mention: ['Smoke-free home'], avoid_words: ['rare'] },
    fee_overrides: {}, marketplaces: ['depop', 'vinted'], price_strategy: 'same', stale_after_days: 30,
  };
}

test('listing setup saves pricing and tone before continuing and reuses them in Settings', async ({ page }, info) => {
  await mockSupabase(page, { empty: true });
  let profile = sellerProfile();
  const updates: unknown[] = [];
  await page.route(`${SUPABASE}/rest/v1/profiles*`, async route => {
    if (route.request().method() === 'PATCH') {
      const patch = route.request().postDataJSON();
      updates.push(patch);
      profile = { ...profile, ...patch };
    }
    const single = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(single ? profile : [profile]) });
  });
  await page.goto('/scan');
  await expect(page.getByRole('button', { name: 'Same price everywhere', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Friendly', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Same take-home everywhere', exact: true }).click();
  await page.getByRole('button', { name: 'Minimal', exact: true }).click();
  await page.screenshot({ path: `test-results/listing-setup-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Fill it in myself', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check it over' })).toBeVisible();
  expect(updates).toEqual([{ price_strategy: 'match_take_home', voice: { ...sellerProfile().voice, tone: 'minimal' } }]);
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: 'Same take-home everywhere', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Minimal', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/scan');
  await expect(page.getByRole('button', { name: 'Same take-home everywhere', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Minimal', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('initial setup saves a private address and Settings can edit or remove it', async ({ page }) => {
  await mockSupabase(page, { empty: true });
  let profile: Record<string, unknown> = sellerProfile();
  await page.route(`${SUPABASE}/rest/v1/profiles*`, async route => {
    if (route.request().method() === 'PATCH') profile = { ...profile, ...route.request().postDataJSON() };
    const single = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(single ? profile : [profile]) });
  });
  await page.goto('/scan');
  await expect(page.getByRole('complementary', { name: 'Before listing with the extension' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Depop', exact: true })).toHaveAttribute('href', /depop\.com/);
  await page.getByLabel('Full name', { exact: true }).fill('Sam Seller');
  await page.getByLabel('Street address', { exact: true }).fill('123 Test Lane');
  await page.getByLabel('City / town', { exact: true }).fill('Berkeley');
  await page.getByLabel('State / province / region', { exact: true }).fill('CA');
  await page.getByLabel('ZIP / postal code', { exact: true }).fill('09470');
  await page.getByRole('button', { name: 'Fill it in myself', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check it over' })).toBeVisible();
  expect(profile.seller_address).toMatchObject({ full_name: 'Sam Seller', line1: '123 Test Lane', city: 'Berkeley', state: 'CA', postal_code: '09470', country: 'US' });
  await page.goto('/settings#seller-address');
  await expect(page.getByLabel('Street address', { exact: true })).toHaveValue('123 Test Lane');
  await page.getByLabel('Street address', { exact: true }).fill('456 Test Road');
  await page.getByRole('button', { name: 'Save address', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Address saved' })).toBeVisible();
  expect(profile.seller_address).toMatchObject({ line1: '456 Test Road' });
  await page.getByRole('button', { name: 'Remove saved address', exact: true }).click();
  await expect(page.getByLabel('Street address', { exact: true })).toHaveValue('');
  expect(profile.seller_address).toBeNull();
});

test('an incomplete address stays in setup so the seller can correct it', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/scan');
  await page.getByLabel('Street address', { exact: true }).fill('123 Test Lane');
  await page.getByRole('button', { name: 'Fill it in myself', exact: true }).click();
  await expect(page.getByText('Complete your name, street address, city, postal code and country, or leave the address blank.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Scan an item' })).toBeVisible();
});

test('a failed defaults save keeps the seller in setup and can be retried', async ({ page }) => {
  await mockSupabase(page);
  let fail = true;
  let profile = sellerProfile();
  await page.route(`${SUPABASE}/rest/v1/profiles*`, async route => {
    if (route.request().method() === 'PATCH') {
      if (fail) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Could not save listing defaults. Try again.' }) });
      profile = { ...profile, ...route.request().postDataJSON() };
    }
    const single = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(single ? profile : [profile]) });
  });
  await page.goto('/scan');
  await page.getByRole('button', { name: 'Same take-home everywhere', exact: true }).click();
  await page.getByRole('button', { name: 'Fill it in myself', exact: true }).click();
  await expect(page.getByText('Could not save listing defaults. Try again.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Scan an item' })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Fill it in myself', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check it over' })).toBeVisible();
});
