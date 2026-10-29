// Small DOM helpers the sell-form drivers share. Content scripts live in an
// isolated world: they see the page's DOM and its events, never its JS, so
// everything here works through the DOM alone.

import { sleep } from '../shared/browser.ts';
import { setValue } from './sites.ts';

/** Shown on screen. Uses client rects, so fixed-position modals count too. */
export function shown(el: Element | null | undefined): el is HTMLElement {
  if (!el || !el.isConnected) return false;
  if (!(el as HTMLElement).getClientRects().length) return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el as HTMLElement);
  return !style || style.visibility !== 'hidden';
}

export async function waitFor<T>(find: () => T | null | undefined | false, ms: number, every = 250): Promise<T | null> {
  const end = Date.now() + ms;
  for (;;) {
    const hit = find();
    if (hit) return hit;
    if (Date.now() >= end) return null;
    await sleep(every);
  }
}

/** Lower case, accents and punctuation gone, single spaces. */
export function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const text = (el: Element | null | undefined) => ((el as HTMLElement | null)?.innerText ?? el?.textContent ?? '').trim();

/**
 * Click an element. A plain click is what both Depop's React and Poshmark's
 * Vue listen for; adding mousedown too toggles some of Poshmark's menus twice.
 */
export function press(el: Element): void {
  (el as HTMLElement).scrollIntoView?.({ block: 'center' });
  (el as HTMLElement).click();
}

/** Type into an input the way a person would, so search-as-you-type lists open. */
export function typeText(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const win = el.ownerDocument.defaultView ?? window;
  el.focus();
  const proto = el instanceof win.HTMLTextAreaElement ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
}

export function pressKey(el: Element, key: string): void {
  const win = el.ownerDocument.defaultView ?? window;
  const code = key === 'Enter' ? 13 : key === 'Escape' ? 27 : 0;
  for (const type of ['keydown', 'keypress', 'keyup']) {
    el.dispatchEvent(new win.KeyboardEvent(type, { key, code: key, keyCode: code, which: code, bubbles: true, cancelable: true }));
  }
}

export { setValue };

/**
 * The best of several labelled options for a list of wanted words, best word
 * first. Exact matches beat matches on a word boundary; nothing loose.
 */
export function pickOption<T>(options: T[], label: (o: T) => string, wants: string[]): T | null {
  const keyed = options.map(o => ({ o, n: norm(label(o)) }));
  for (const want of wants.map(norm).filter(Boolean)) {
    const exact = keyed.find(k => k.n === want);
    if (exact) return exact.o;
  }
  for (const want of wants.map(norm).filter(Boolean)) {
    const loose = keyed.find(k => k.n.startsWith(`${want} `) || ` ${k.n} `.includes(` ${want} `));
    if (loose) return loose.o;
  }
  return null;
}

const SERVER_WORDS =
  /\b(?:status|error|code|http)[\s:]*(?:code\s*)?50[0-4]\b|\b50[0-4]\s*[-–:|]?\s*(?:error|internal|bad gateway|service|server)|server error|service unavailable|bad gateway|gateway time-?out|something went wrong|try again later/i;

/** A message that blames the site's server rather than the form, so trying again can work. */
export const isServerError = (message: string) => SERVER_WORDS.test(message);

/**
 * The page itself came back as a server error: the HTTP status of the
 * document, or an error page's title or heading.
 */
export function pageError(doc: Document = document): string | null {
  const nav = doc.defaultView?.performance?.getEntriesByType?.('navigation')[0] as (PerformanceEntry & { responseStatus?: number }) | undefined;
  if (nav?.responseStatus && nav.responseStatus >= 500) return `HTTP ${nav.responseStatus}`;
  for (const el of [doc.querySelector('title'), ...doc.querySelectorAll('h1, h2')]) {
    const t = text(el);
    if (t && t.length < 80 && SERVER_WORDS.test(t)) return t;
  }
  return null;
}

/** Short alerts or toasts on screen that blame the server. */
export function serverAlertEls(doc: Document = document): HTMLElement[] {
  return [...doc.querySelectorAll<HTMLElement>('[role="alert"], [role="status"], [class*="toast" i], [class*="snackbar" i], [class*="error" i]')].filter(el => {
    const t = text(el);
    return t && t.length < 160 && shown(el) && SERVER_WORDS.test(t);
  });
}

export const serverAlerts = (doc: Document = document) => [...new Set(serverAlertEls(doc).map(text))];

/** A server alert that was not on screen before pressing a button: the toast from the last try may linger. */
export function newServerAlert(before: Set<Element>, doc: Document = document): string | null {
  const fresh = serverAlertEls(doc).find(el => !before.has(el));
  return fresh ? text(fresh) : null;
}

/** Hand files to an upload input, as if the seller had picked them. */
export function giveFiles(input: HTMLInputElement, files: File[]): void {
  const win = input.ownerDocument.defaultView ?? window;
  const transfer = new win.DataTransfer();
  for (const f of input.multiple ? files : files.slice(0, 1)) transfer.items.add(f);
  input.files = transfer.files;
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
  input.dispatchEvent(new win.Event('change', { bubbles: true }));
}
