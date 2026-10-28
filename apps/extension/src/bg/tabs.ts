// Finding, opening and talking to marketplace tabs.

import { MARKETPLACES, type MarketplaceId } from '@pilego/core';
import { ext, sleep } from '../shared/browser.ts';

export const VINTED_TABS = [
  'https://www.vinted.at/*', 'https://www.vinted.be/*', 'https://www.vinted.co.uk/*', 'https://www.vinted.com/*',
  'https://www.vinted.cz/*', 'https://www.vinted.de/*', 'https://www.vinted.dk/*', 'https://www.vinted.es/*',
  'https://www.vinted.fi/*', 'https://www.vinted.fr/*', 'https://www.vinted.gr/*', 'https://www.vinted.hr/*',
  'https://www.vinted.hu/*', 'https://www.vinted.ie/*', 'https://www.vinted.it/*', 'https://www.vinted.lt/*',
  'https://www.vinted.lu/*', 'https://www.vinted.nl/*', 'https://www.vinted.pl/*', 'https://www.vinted.pt/*',
  'https://www.vinted.ro/*', 'https://www.vinted.se/*', 'https://www.vinted.sk/*',
];

export function tabPatterns(market: MarketplaceId): string[] {
  return market === 'vinted' ? VINTED_TABS : MARKETPLACES[market].hosts;
}

export async function openTabs(market: MarketplaceId): Promise<chrome.tabs.Tab[]> {
  try {
    return await ext.tabs.query({ url: tabPatterns(market) });
  } catch {
    return [];
  }
}

/** Vinted's domain for a region, used when the seller has no Vinted tab open yet. */
export function vintedSiteFor(region: string | null | undefined): string {
  switch (region) {
    case 'US':
      return 'https://www.vinted.com';
    case 'EU':
      return 'https://www.vinted.fr';
    default:
      return 'https://www.vinted.co.uk';
  }
}

export function waitForLoad(tabId: number, ms = 30_000): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(finish, ms);
    function finish() {
      clearTimeout(timer);
      ext.tabs.onUpdated.removeListener(listen);
      resolve();
    }
    function listen(id: number, info: { status?: string }) {
      if (id === tabId && info.status === 'complete') finish();
    }
    ext.tabs.onUpdated.addListener(listen);
    ext.tabs.get(tabId).then(t => t.status === 'complete' && finish(), finish);
  });
}

/** Send to a tab's content script, waiting for it to come up if the page is still loading. */
export async function sendToTab<T>(tabId: number, msg: unknown, readyMs = 20_000): Promise<T> {
  const end = Date.now() + readyMs;
  let last: unknown;
  while (Date.now() < end) {
    try {
      return (await ext.tabs.sendMessage(tabId, msg)) as T;
    } catch (err) {
      last = err;
      // "Receiving end does not exist": the content script is not there yet.
      await sleep(1000);
    }
  }
  throw new Error(`The tab did not answer (${last instanceof Error ? last.message : String(last)}). Reload it and try again.`);
}

/** A tab whose content script answers a ping. Tabs opened before the extension was installed need a reload. */
export async function readyTab(tab: chrome.tabs.Tab, ping: unknown): Promise<boolean> {
  if (tab.id == null) return false;
  try {
    await ext.tabs.sendMessage(tab.id, ping);
    return true;
  } catch {
    await ext.tabs.reload(tab.id);
    await waitForLoad(tab.id);
    try {
      await sendToTab(tab.id, ping, 15_000);
      return true;
    } catch {
      return false;
    }
  }
}
