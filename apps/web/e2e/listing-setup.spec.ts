import { expect, test, type Page } from '@playwright/test';
import { mockSupabase, SUPABASE, UID } from './fixtures';

function sellerProfile() {
  return {
    id: UID, display_name: 'sam.seller', currency: 'USD', region: 'US', measurement_unit: 'in',
    voice: { tone: 'friendly', sign_off: 'Ships next day.', always_mention: ['Smoke-free home'], avoid_words: ['rare'] },
    fee_overrides: {}, marketplaces: ['ebay', 'vinted', 'depop', 'poshmark'], price_strategy: 'same', stale_after_days: 30,
    seller_address: null,
  };
}

/** A first sign-in: the profile the sign-up trigger made, and a record of what the quiz saves. */
async function newSeller(page: Page, opts: { failFirstSave?: boolean } = {}) {
  await mockSupabase(page, { empty: true, newUser: true });
  let profile: Record<string, unknown> = sellerProfile();
  let fail = Boolean(opts.failFirstSave);
  const updates: Array<Record<string, unknown>> = [];
  const onboarded: unknown[] = [];
  await page.route(`${SUPABASE}/rest/v1/profiles*`, async route => {
    if (route.request().method() === 'PATCH') {
      if (fail) {
        fail = false;
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Could not save your answers. Try again.' }) });
      }
      const patch = route.request().postDataJSON();
      updates.push(patch);
      profile = { ...profile, ...patch };
    }
    const single = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(single ? profile : [profile]) });
  });
  page.on('request', req => {
    if (req.url().startsWith(`${SUPABASE}/auth/v1/user`) && req.method() === 'PUT') onboarded.push(req.postDataJSON().data);
  });
  return { updates, onboarded, profile: () => profile };
}

const next = (page: Page) => page.getByRole('button', { name: 'Next', exact: true }).click();
const question = (page: Page, name: string | RegExp) => expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

test('a new seller answers the setup quiz once and lands on the scan page', async ({ page }, info) => {
  const seller = await newSeller(page);
  await page.goto('/');
  await question(page, 'Hey sam! Where do you sell?');
  await expect(page.getByRole('progressbar', { name: 'Setup' })).toHaveAttribute('aria-valuenow', '1');
  // eBay off, Grailed on; none at all cannot continue.
  await page.getByRole('checkbox', { name: /eBay/ }).click();
  await page.getByRole('checkbox', { name: /Grailed/ }).click();
  await page.screenshot({ path: `test-results/quiz-where-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await next(page);

  await question(page, 'Where do you ship from?');
  await page.getByRole('radio', { name: /United Kingdom/ }).click();
  await next(page);

  await question(page, 'How should prices work?');
  await page.getByRole('radio', { name: /Same take-home everywhere/ }).click();
  await next(page);

  await question(page, 'How should your listings sound?');
  await page.getByRole('radio', { name: /Minimal/ }).click();
  await next(page);

  await question(page, 'Where do parcels ship from?');
  await page.getByLabel('Full name', { exact: true }).fill('Sam Seller');
  await page.getByLabel('Street address', { exact: true }).fill('12 Test Street');
  await page.getByLabel('City / town', { exact: true }).fill('Leeds');
  await page.getByLabel('ZIP / postal code', { exact: true }).fill('LS1 1AA');
  await next(page);

  await question(page, 'Last thing: log in to your sites');
  await expect(page.getByRole('complementary', { name: 'Before listing with the extension' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Grailed', exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/quiz-logins-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Scan my first piece' }).click();

  await expect(page.getByRole('heading', { name: 'Scan an item' })).toBeVisible();
  expect(seller.updates).toHaveLength(1);
  expect(seller.updates[0]).toMatchObject({
    marketplaces: ['vinted', 'depop', 'poshmark', 'grailed'],
    region: 'UK', currency: 'GBP', measurement_unit: 'cm', price_strategy: 'match_take_home',
    voice: { ...sellerProfile().voice, tone: 'minimal' },
    seller_address: { full_name: 'Sam Seller', line1: '12 Test Street', city: 'Leeds', postal_code: 'LS1 1AA', country: 'GB' },
  });
  expect(seller.onboarded).toEqual([{ onboarded: true }]);
  // The scan page is photos and the AI now, not a settings form.
  await expect(page.getByText('Add photos. The AI does the rest.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Same price everywhere' })).toHaveCount(0);
  await expect(page.getByLabel('Street address')).toHaveCount(0);
});

test('the address question can be skipped, and a half-filled one has to be finished', async ({ page }) => {
  const seller = await newSeller(page);
  await page.goto('/');
  for (let i = 0; i < 4; i++) await next(page);
  await question(page, 'Where do parcels ship from?');
  await page.getByLabel('Street address', { exact: true }).fill('123 Test Lane');
  await next(page);
  await expect(page.getByText('Complete your name, street address, city, postal code and country, or leave the address blank.')).toBeVisible();
  await question(page, 'Where do parcels ship from?');
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await question(page, 'Last thing: log in to your sites');
  await page.getByRole('button', { name: 'Back' }).click();
  await question(page, 'Where do parcels ship from?');
  await expect(page.getByLabel('Street address', { exact: true })).toHaveValue('');
  await next(page);
  await page.getByRole('button', { name: 'Look around first' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Last thing: log in to your sites' })).toHaveCount(0);
  expect(seller.updates[0]).toMatchObject({ seller_address: null, region: 'US', price_strategy: 'same' });
});

test('a failed save keeps the seller on the last question to try again', async ({ page }) => {
  const seller = await newSeller(page, { failFirstSave: true });
  await page.goto('/');
  for (let i = 0; i < 4; i++) await next(page);
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Scan my first piece' }).click();
  await expect(page.getByText('Could not save your answers. Try again.')).toBeVisible();
  await question(page, 'Last thing: log in to your sites');
  expect(seller.onboarded).toEqual([]);
  await page.getByRole('button', { name: 'Scan my first piece' }).click();
  await expect(page.getByRole('heading', { name: 'Scan an item' })).toBeVisible();
  expect(seller.onboarded).toHaveLength(1);
});

test('a seller who has done the quiz goes straight to the app', async ({ page }) => {
  await mockSupabase(page, { empty: true });
  await page.goto('/scan');
  await expect(page.getByRole('heading', { name: 'Scan an item' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Setup' })).toHaveCount(0);
});

test('the sign-in email limit reads as plain words and offers the link already sent', async ({ page }) => {
  await mockSupabase(page, { signedIn: false });
  await page.route(`${SUPABASE}/auth/v1/otp*`, route =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ code: 'over_email_send_rate_limit', error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' }),
    }),
  );
  await page.goto('/');
  await page.getByLabel('Email').fill('sam@example.com');
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('too many sign-in emails in the last hour');
  await expect(alert).not.toContainText('email rate limit exceeded');
  await alert.getByRole('button', { name: 'I already have a link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
});

test('a sent link waits a minute before another can be asked for', async ({ page }) => {
  await mockSupabase(page, { signedIn: false });
  let sent = 0;
  await page.route(`${SUPABASE}/auth/v1/otp*`, route => {
    sent += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' });
  });
  await page.goto('/');
  await page.getByLabel('Email').fill('sam@example.com');
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Send again in \d+s/ })).toBeDisabled();
  expect(sent).toBe(1);
});
