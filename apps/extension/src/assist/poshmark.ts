// Fills Poshmark's listing editor and lists the item.
//
// Poshmark's editor (poshmark.com/create-listing, October 2026) is Vue. Each
// part is a `.listing-editor__subsection` whose first line names it (CATEGORY,
// SIZE, CONDITION …), with `.dropdown__selector` openers and menus of <li>.
// Photos open a cover-shot editor that needs Apply; the price opens a modal
// that needs Done; Next opens a share screen with "List This Item".
//
// The data-vv-name and data-et-name hooks come from eBayOS's
// poshmark-content.js and were checked against the live page.

import { sleep } from '../shared/browser.ts';
import type { ListingWork } from '../shared/messages.ts';
import { conditionWords, poshmarkCategory, poshmarkColours, poshmarkTags, sizeWants } from './choices.ts';
import { giveFiles, norm, pageError, pickOption, press, pressKey, newServerAlert, serverAlertEls, serverAlerts, setValue, shown, text, typeText, waitFor } from './dom.ts';
import { Tally, type Driver, type DriverContext } from './driver.ts';

const MAX_PHOTOS = 16;

function section(name: string): HTMLElement | null {
  const want = name.toUpperCase();
  return (
    [...document.querySelectorAll<HTMLElement>('.listing-editor__subsection')].find(s =>
      text(s).toUpperCase().replace(/\s+/g, ' ').startsWith(want),
    ) ?? null
  );
}

/** Click a menu row the way Poshmark listens for it: on the link or block inside the <li>. */
function pressRow(li: Element) {
  press(li.querySelector('a, div') ?? li);
}

const rowLabel = (li: Element) => text(li).split('\n')[0]!.trim();

async function openSelector(scope: Element | null): Promise<boolean> {
  const opener = scope?.querySelector<HTMLElement>('.dropdown__selector');
  if (!opener) return false;
  press(opener);
  await sleep(450);
  return true;
}

function visibleModal(): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>('.modal')].find(shown) ?? null;
}

function modalButton(names: RegExp): HTMLButtonElement | null {
  const modal = visibleModal();
  if (!modal) return null;
  return [...modal.querySelectorAll<HTMLButtonElement>('button')].find(b => names.test(text(b)) && shown(b)) ?? null;
}

async function photos(files: File[]): Promise<number> {
  const wanted = files.slice(0, MAX_PHOTOS);
  if (!wanted.length) return 0;
  const input = await waitFor(() => document.querySelector<HTMLInputElement>('#img-file-input, input[type="file"][accept*="jpg"]'), 20_000);
  if (!input) return 0;
  giveFiles(input, wanted);
  // The cover-shot editor opens with every photo in it; Apply keeps them all.
  const apply = await waitFor(
    () => [...document.querySelectorAll<HTMLButtonElement>('.image-edit-modal button, button[data-et-name="apply"]')].find(b => /apply/i.test(text(b)) && shown(b)),
    20_000,
  );
  if (apply) {
    press(apply);
    await waitFor(() => !shown(apply) || null, 15_000);
  }
  await sleep(800);
  const section = document.querySelector('[data-et-name="listingEditorImageSection"]')?.closest('.listing-editor__section') ?? document;
  return [...section.querySelectorAll('img')].filter(shown).length || (apply ? wanted.length : 0);
}

async function category(item: ListingWork['item']): Promise<{ category: string | null; subcategory: string | null }> {
  const want = poshmarkCategory(item);
  const box = document.querySelector('.listing-editor__category-container');
  if (!box) return { category: null, subcategory: null };
  let chosen: string | null = null;
  for (let attempt = 0; attempt < 2 && !chosen; attempt += 1) {
    await openSelector(box);
    let dept = box.querySelector<HTMLElement>(`a[data-et-name="${want.department}"]`);
    if (!dept) {
      // Showing another department's list: go back to all of them first.
      const all = box.querySelector<HTMLElement>('a[data-et-name="all"]');
      if (all) {
        press(all);
        await sleep(400);
      }
      dept = box.querySelector<HTMLElement>(`a[data-et-name="${want.department}"]`);
    }
    if (!dept) continue;
    press(dept);
    await sleep(500);
    const rows = [...box.querySelectorAll<HTMLElement>('ul li')].filter(li => !li.querySelector(`a[data-et-name]`));
    const hit = pickOption(rows, rowLabel, want.category);
    if (hit) {
      chosen = rowLabel(hit);
      pressRow(hit);
      await sleep(700);
    }
  }
  if (!chosen) return { category: null, subcategory: null };

  let sub: string | null = null;
  const subBox = document.querySelector('.listing-editor__subcategory-container');
  if (want.subcategory.length && subBox) {
    await openSelector(subBox);
    const rows = [...subBox.querySelectorAll<HTMLElement>('li')];
    const hit = pickOption(rows.filter(r => rowLabel(r) !== 'None'), rowLabel, want.subcategory);
    if (hit) {
      sub = rowLabel(hit);
      pressRow(hit);
      await sleep(500);
    } else document.body.click();
  }
  return { category: chosen, subcategory: sub };
}

async function size(value: string | null): Promise<string | null> {
  const box = section('SIZE');
  if (!box || !value) return null;
  await openSelector(box);
  const wants = sizeWants(value);
  const buttons = () => [...box.querySelectorAll<HTMLButtonElement>('ul li button, .listing-editor__size-system button')].filter(shown);
  const hit = pickOption(buttons(), b => text(b), wants);
  if (hit) {
    const chosen = text(hit);
    press(hit);
    await sleep(500);
    return chosen;
  }
  // Not a standard size: Poshmark takes a custom one.
  const custom = [...box.querySelectorAll<HTMLElement>('.navigation--horizontal__tab')].find(t => /custom/i.test(text(t)));
  if (custom) {
    press(custom.querySelector('a, div, span') ?? custom);
    await sleep(400);
    const input = [...box.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])')].find(shown);
    const save = [...box.querySelectorAll<HTMLButtonElement>('button')].find(b => /save/i.test(text(b)) && shown(b));
    if (input && save) {
      typeText(input, value.slice(0, 20));
      press(save);
      await sleep(500);
      const added = pickOption(buttons(), b => text(b), [value]);
      if (added) {
        press(added);
        await sleep(400);
        return value;
      }
    }
  }
  document.body.click();
  await sleep(200);
  const shownValue = text(box.querySelector('.dropdown__selector'));
  return shownValue && !/select size/i.test(shownValue) ? shownValue : null;
}

async function condition(item: ListingWork['item']): Promise<string | null> {
  const box = document.querySelector('.listing-editor__condition-container') ?? section('CONDITION');
  if (!box) return null;
  await openSelector(box);
  const rows = [...box.querySelectorAll<HTMLElement>('ul li')];
  const hit = pickOption(rows, rowLabel, conditionWords('poshmark', item));
  if (!hit) return null;
  const chosen = rowLabel(hit);
  pressRow(hit);
  await sleep(500);
  // New With Tags asks the seller to confirm Poshmark's policy.
  const confirm = modalButton(/^(yes|ok|got it!?|i agree|confirm)$/i);
  if (confirm) {
    press(confirm);
    await sleep(400);
  }
  return chosen;
}

async function brand(name: string | null): Promise<string | null> {
  if (!name) return null;
  const input = document.querySelector<HTMLInputElement>('input[placeholder="Enter the Brand/Designer"], input[data-vv-name="brand"]');
  if (!input) return null;
  typeText(input, name);
  // A suggestion list may open; the exact brand from it beats free text.
  const list = await waitFor(() => {
    const rows = [...(input.closest('.listing-editor__subsection, .dropdown') ?? document).querySelectorAll<HTMLElement>('li')].filter(shown);
    return rows.length ? rows : null;
  }, 1500);
  const hit = list ? pickOption(list, rowLabel, [name]) : null;
  if (hit) pressRow(hit);
  else {
    input.dispatchEvent(new Event('change', { bubbles: true }));
    pressKey(input, 'Escape');
    input.blur();
  }
  await sleep(300);
  return input.value || null;
}

async function colours(item: ListingWork['item']): Promise<string[]> {
  const names = poshmarkColours(item);
  const box = section('COLOR');
  if (!names.length || !box) return [];
  await openSelector(box);
  const tiles = [...box.querySelectorAll<HTMLElement>('li.listing-editor__tile--color, li')];
  const picked: string[] = [];
  for (const name of names) {
    const hit = pickOption(tiles, t => text(t), [name]);
    if (!hit) continue;
    press(hit.querySelector('a') ?? hit);
    picked.push(name);
    await sleep(300);
  }
  const done = [...box.querySelectorAll<HTMLButtonElement>('button')].find(b => /^done$/i.test(text(b)) && shown(b));
  if (done) press(done);
  await sleep(300);
  return picked;
}

async function tags(item: ListingWork['item']): Promise<string[]> {
  const box = section('STYLE TAGS');
  const input = box?.querySelector<HTMLInputElement>('input');
  if (!box || !input) return [];
  const added: string[] = [];
  for (const tag of poshmarkTags(item)) {
    input.focus();
    press(input);
    await sleep(250);
    const suggestion = [...box.querySelectorAll<HTMLElement>('[data-et-name]')].find(
      d => d !== input && norm(d.getAttribute('data-et-name')) === norm(tag) && !d.querySelector('[data-et-name]'),
    );
    if (suggestion) press(suggestion);
    else {
      typeText(input, tag);
      await sleep(250);
      pressKey(input, 'Enter');
    }
    await sleep(350);
    added.push(tag);
  }
  input.blur();
  const chips = [...box.querySelectorAll('.listing-editor__tag__div')].map(c => text(c));
  return chips.length ? chips : added;
}

async function price(work: ListingWork, originalOverride?: number): Promise<boolean> {
  const value = work.listing.price;
  const originalPrice = originalOverride ?? work.item.original_price;
  if (value == null) return false;
  const field = document.querySelector<HTMLInputElement>('input[data-vv-name="listingPrice"]');
  if (!field) return false;
  press(field);
  field.focus();
  const modalInput = await waitFor(() => {
    const el = document.getElementById('listing-price-modal-listing-price-input') as HTMLInputElement | null;
    return el && shown(el) ? el : null;
  }, 3000);
  if (modalInput) {
    setValue(modalInput, String(value));
    const original = document.getElementById('listing-price-modal-original-price-input') as HTMLInputElement | null;
    if (original && originalPrice != null) setValue(original, String(originalPrice));
    await sleep(300);
    const done = modalButton(/^done$/i);
    if (done) press(done);
    await sleep(500);
  } else {
    setValue(field, String(value));
    const original = document.querySelector<HTMLInputElement>('input[data-vv-name="originalPrice"]');
    if (original && originalPrice != null) setValue(original, String(originalPrice));
  }
  return Number(field.value) > 0;
}

/** Poshmark's own word that the listing is up, for when it stays on the editor's address. */
function listedShown(): boolean {
  const modal = visibleModal();
  const words = /listing is (now )?live|successfully listed|has been listed|is now listed|now live|congrat/i;
  if (modal && words.test(text(modal))) return true;
  return [...document.querySelectorAll<HTMLElement>('[role="alert"], [role="status"], [class*="toast" i], [class*="snackbar" i]')].some(
    el => shown(el) && words.test(text(el)),
  );
}

function visibleErrors(): string[] {
  const out = new Set<string>();
  for (const el of document.querySelectorAll<HTMLElement>('.form__error-message')) {
    const t = text(el);
    if (t && t !== 'false' && shown(el)) out.add(t);
  }
  return [...out];
}

export const fillPoshmark: Driver = async (work: ListingWork, files: File[], ctx: DriverContext) => {
  const tally = new Tally();
  const { item, listing } = work;

  ctx.step('Waiting for Poshmark’s form…');
  const ready = await waitFor(
    () => (document.querySelector('input[data-vv-name="title"]') && document.querySelector('.listing-editor__category-container')) || pageError(),
    60_000,
  );
  const broken = pageError();
  if (broken) {
    tally.retry = true;
    return tally.result(false, `Poshmark’s server had a problem (${broken}).`);
  }
  if (!ready) {
    // Say what the tab shows instead, so a login page or a pop-up is easy to spot.
    const shows = text(document.querySelector('main') ?? document.body).replace(/\s+/g, ' ').slice(0, 120);
    return tally.result(false, `Poshmark’s listing form did not load (the tab shows ${location.pathname}${shows ? `: “${shows}”` : ''}). Are you logged in to Poshmark?`);
  }

  ctx.check();
  ctx.step('Adding photos…');
  tally.photos = await photos(files);
  tally.ok('photos', tally.photos);

  ctx.check();
  ctx.step('Title and description…');
  const title = document.querySelector<HTMLInputElement>('input[data-vv-name="title"]')!;
  setValue(title, listing.title.slice(0, 80));
  tally.ok('title', title.value);
  const description = document.querySelector<HTMLTextAreaElement>('textarea[data-vv-name="description"]');
  if (description) setValue(description, listing.description.slice(0, 1500));
  tally.ok('description', description?.value);

  ctx.check();
  ctx.step('Category…');
  const cat = await category(item);
  tally.ok('category', cat.category);
  if (poshmarkCategory(item).subcategory.length) tally.ok('subcategory', cat.subcategory);

  ctx.check();
  ctx.step('Size, condition and brand…');
  tally.ok('size', await size(item.size));
  tally.ok('condition', await condition(item));
  if (item.brand) tally.ok('brand', await brand(item.brand));

  ctx.check();
  ctx.step('Colour and style tags…');
  if (poshmarkColours(item).length) tally.ok('colour', await colours(item));
  tally.ok('style tags', await tags(item));

  ctx.check();
  ctx.step('Price…');
  tally.ok('price', await price(work));

  const blocking = ['photos', 'title', 'description', 'category', 'price'].filter(n => tally.missing.includes(n));
  if (blocking.length) {
    const said = serverAlerts()[0];
    if (said) tally.retry = true;
    return tally.result(false, said ? `Poshmark’s server had a problem (${said}).` : undefined);
  }

  ctx.check();
  ctx.step('Checking the listing…');
  const next = document.querySelector<HTMLButtonElement>('button[data-et-name="next"]');
  if (!next) return tally.result(false, 'Could not find Poshmark’s Next button.');
  press(next);
  let list = await waitFor(() => [...document.querySelectorAll<HTMLButtonElement>('button[data-et-name="list"]')].find(shown) ?? null, 15_000);
  if (!list) {
    // Poshmark wants an original price on some categories: the listing price is the honest fallback.
    const original = document.querySelector<HTMLInputElement>('input[data-vv-name="originalPrice"]');
    if (original && !original.value && listing.price != null) {
      await price(work, work.item.original_price ?? listing.price);
      press(next);
      list = await waitFor(() => [...document.querySelectorAll<HTMLButtonElement>('button[data-et-name="list"]')].find(shown) ?? null, 10_000);
    }
  }
  if (!list) {
    const why = visibleErrors();
    return tally.result(false, why.length ? `Poshmark wants: ${why.slice(0, 4).join('; ')}.` : 'Poshmark did not accept the form.');
  }

  if (!(await ctx.beforePost())) return tally.result(false);
  ctx.step('Listing on Poshmark…');
  // Poshmark uploads the photos once List is pressed, which can take a minute or two.
  for (let attempt = 1; ; attempt += 1) {
    const before = new Set<Element>(serverAlertEls());
    press(list);
    let said: string | null = null;
    const outcome = await waitFor(
      () => {
        if (!/\/create-listing/.test(location.pathname) || listedShown()) return 'posted';
        said = newServerAlert(before) ?? pageError();
        if (said) return 'server';
        // Poshmark sometimes asks to confirm or shows a tip after listing.
        const ok = modalButton(/^(ok|got it!?|done|continue)$/i);
        if (ok) press(ok);
        return null;
      },
      180_000,
      700,
    );
    if (outcome === 'posted') return tally.result(true);
    if (outcome !== 'server') break;
    const again = [...document.querySelectorAll<HTMLButtonElement>('button[data-et-name="list"]')].find(shown);
    if (attempt >= 3 || !again) {
      tally.retry = true;
      return tally.result(false, `Poshmark’s server had a problem (${said}).`);
    }
    ctx.step(`Poshmark’s server had a problem. Trying again in ${5 * attempt} seconds…`);
    await sleep(5000 * attempt);
    ctx.check();
    ctx.step('Listing on Poshmark…');
    list = again;
  }
  const why = visibleErrors();
  return tally.result(false, why.length ? `Poshmark wants: ${why.slice(0, 4).join('; ')}.` : 'Poshmark did not confirm the listing.');
};
