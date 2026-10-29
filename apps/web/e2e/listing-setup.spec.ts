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
