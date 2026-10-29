// Loads the built Chrome extension into Chromium with mock marketplace sites.
import { test as base, chromium, type BrowserContext, type Worker } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/chrome', import.meta.url));

export const test = base.extend<{ context: BrowserContext; worker: Worker }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
    });
    await use(context);
    await context.close();
  },
  worker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(worker);
  },
});

export const expect = test.expect;

/** A 1x1 PNG, standing in for a garment photo. */
export const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export function work(overrides: Record<string, unknown> = {}) {
  return {
    job_id: 'job-1',
    listing_id: 'listing-1',
    marketplace: 'vinted',
    listing: {
      marketplace: 'vinted',
      title: 'Levi’s denim trucker jacket',
      description: 'Mid-wash trucker, barely worn.',
      hashtags: [],
      price: 32,
      currency: 'GBP',
      condition_label: 'Good',
      category_path: 'Women › Coats and jackets › Denim jackets',
      fields: [
        { key: 'price', label: 'Price', value: '32' },
        { key: 'brand', label: 'Brand', value: 'Levi’s' },
        { key: 'size', label: 'Size', value: 'M' },
        { key: 'condition', label: 'Condition', value: 'Good' },
      ],
      warnings: [],
    },
    item: {
      sku: 'OUT-ABCD',
      brand: 'Levi’s',
      department: 'women',
      category: 'outerwear',
      subcategory: 'denim-jackets',
      size: 'M',
      colors: ['blue'],
      condition: 'good',
      original_price: 90,
      materials: [],
      style_tags: [],
      era: null,
    },
    photos: [{ data: PNG, type: 'image/png', name: 'a.png' }],
    learned: {},
    external_id: null,
    external_url: null,
    ...overrides,
  };
}

export async function tabId(worker: Worker, url: string): Promise<number> {
  return worker.evaluate(async pattern => {
    const tabs = await chrome.tabs.query({ url: pattern });
    return tabs[0]!.id!;
  }, url);
}
