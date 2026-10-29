import { expect, test } from '@playwright/test';
import { mockSupabase } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockSupabase(page, { signedIn: false });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Clear the pile/ })).toBeVisible();
});

test('toss, reset, pause and keyboard play preserve sign-in', async ({ page }) => {
  const shoe = page.locator('[data-hero-piece="mexico66Yellow"]');
  const initial = await shoe.boundingBox();
  await page.getByRole('button', { name: 'Toss the pile', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('1 toss');
  await expect.poll(async () => {
    const box = await shoe.boundingBox();
    return Math.abs(box!.x - initial!.x) + Math.abs(box!.y - initial!.y);
  }).toBeGreaterThan(12);
  await page.getByRole('button', { name: 'Stack it back' }).click();
  await expect(page.getByRole('status')).toContainText('Drag, fling');
  await expect.poll(async () => {
    return shoe.evaluate(el => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      return Math.abs(matrix.m41) + Math.abs(matrix.m42);
    });
  }).toBeLessThan(1);
  await page.getByRole('button', { name: 'Pause playground motion' }).click();
  await expect(page.locator('.hero-board')).toHaveAttribute('data-moving', 'false');
  await expect(page.locator('.hero-effects')).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume playground motion' }).click();
  await shoe.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('1 toss');
  await page.getByLabel('Email', { exact: true }).fill('play@example.com');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('play@example.com');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('drag leaves the old board bounds and emits effects', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop mouse path; touch is checked separately.');
  const shoe = page.locator('[data-hero-piece="mexico66Yellow"]');
  const box = (await shoe.boundingBox())!;
  const board = (await page.locator('.hero-board').boundingBox())!;
  const target = { x: 170, y: 470 };
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 18 });
  await expect(page.locator('.hero-board')).toHaveAttribute('data-active', 'true');
  expect((await shoe.boundingBox())!.x).toBeLessThan(board.x - 100);
  const hasParticles = await page.locator('.hero-effects').evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    return data.some((n, i) => i % 4 === 3 && n > 0);
  });
  expect(hasParticles).toBe(true);
  await page.screenshot({ path: '../../artifacts/hero-drag-desktop.png' });
  await page.mouse.up();
  await expect(page.getByRole('status')).toContainText('1 toss');
  await expect(page.locator('.hero-board')).toHaveAttribute('data-active', 'false');
  await page.getByLabel('Email', { exact: true }).fill('still-works@example.com');
  const photo = page.locator('.hero-board .polaroid');
  const photoBox = (await photo.boundingBox())!;
  await page.mouse.move(photoBox.x + photoBox.width / 2, photoBox.y + photoBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(420, 300, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole('status')).toContainText('2 tosses');
  await page.getByRole('button', { name: 'Stack it back' }).click();
  await expect.poll(async () => Math.abs((await photo.boundingBox())!.x - photoBox.x)).toBeLessThan(12);
});

test('touch dragging works and the page can still scroll', async ({ page, isMobile, browserName }) => {
  test.skip(!isMobile || browserName !== 'chromium', 'Chromium touch path.');
  await page.evaluate(() => scrollTo(0, 100));
  const box = (await page.locator('[data-hero-piece="mexico66Yellow"]').boundingBox())!;
  const session = await page.context().newCDPSession(page);
  const x = box.x + box.width * 0.45, y = box.y + box.height * 0.5;
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 12; i++) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - i * 5, y: y + i * 5 }] });
    await page.waitForTimeout(16);
  }
  // VFX must follow viewport coordinates even after scrolling the page.
  const trailAtFinger = await page.locator('.hero-effects').evaluate((canvas: HTMLCanvasElement, point) => {
    const dpr = canvas.width / innerWidth;
    const pixels = canvas.getContext('2d')!.getImageData((point.x - 20) * dpr, (point.y - 20) * dpr, 40 * dpr, 40 * dpr).data;
    return pixels.some((n, i) => i % 4 === 3 && n > 0);
  }, { x: x - 60, y: y + 60 });
  expect(trailAtFinger).toBe(true);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('status')).toContainText('1 toss');
  await page.getByLabel('Email', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByLabel('Email', { exact: true })).toBeInViewport();
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(100);
  await session.detach();
});

test('reduced motion keeps feedback and controls without ambient movement', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.hero-board')).toHaveAttribute('data-moving', 'false');
  await expect(page.locator('.hero-effects')).toHaveCount(0);
  await expect(page.locator('.hero-piece-float').first()).toHaveCSS('animation-name', 'none');
  await page.getByRole('button', { name: 'Toss the pile', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('1 toss');
  await page.getByRole('button', { name: 'Stack it back' }).click();
  await expect(page.getByRole('status')).toContainText('Drag, fling');
});
