// Fills Mercari's sell form from top to bottom and presses List.
//
// Mercari's form (mercari.com/sell, October 2026) is React with data-testid
// hooks on every field. A first-time seller gets a "Why not earn some extra
// $$$?" dialog over the form. Category is a dialog of [data-testid=CategoryRow]
// buttons, department > category > subcategory, where "All <category>" picks
// the category itself. Brand and Size are text inputs that open a listbox of
// [role=option] rows on focus. Smart pricing (on by default) lowers the price
// by itself every few days, so it goes off: pileGo owns the price.

import { sleep } from '../shared/browser.ts';
import type { ListingWork } from '../shared/messages.ts';
import { addressParts } from './address.ts';
import { conditionWords, mercariCategory, pickSize } from './choices.ts';
import { giveFiles, isServerError, newServerAlert, norm, pageError, pickOption, press, pressLikeMouse, serverAlertEls, serverAlerts, setValue, shown, text, typeText, waitFor } from './dom.ts';
import { Tally, type Driver, type DriverContext } from './driver.ts';
import { leftForm } from './sites.ts';

const MAX_PHOTOS = 12;

const q = <T extends HTMLElement = HTMLElement>(testid: string) => document.querySelector<T>(`[data-testid="${testid}"]`);

/** The dialog for new sellers, and any other one that sits over the form with a way out. */
async function clearDialogs(): Promise<void> {
  const start = q('NewListerDialogCreateOwn');
  if (shown(start)) {
    press(start);
    await sleep(500);
  }
}

function thumbnails(): number {
  return [...document.querySelectorAll('main img[alt="thumbnail"]')].filter(shown).length;
}

async function photos(files: File[]): Promise<number> {
  const wanted = files.slice(0, MAX_PHOTOS);
  if (!wanted.length) return 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const input = await waitFor(() => q<HTMLInputElement>('SellPhotoInput'), 15_000);
    if (!input) return 0;
    const before = thumbnails();
    giveFiles(input, wanted);
    const after = await waitFor(() => (thumbnails() >= before + wanted.length ? thumbnails() : null), 30_000, 500);
    const added = (after ?? thumbnails()) - before;
    if (added > 0) return added;
    await sleep(2000);
  }
  return 0;
}

const rows = () => [...document.querySelectorAll<HTMLElement>('[data-testid="CategoryRow"]')].filter(shown);
const rowName = (r: HTMLElement) => text(r).split('\n')[0]!.trim();

async function pressRow(wants: string[]): Promise<string | null> {
  const list = (await waitFor(() => (rows().length ? rows() : null), 4000)) ?? [];
  const hit = pickOption(list, rowName, wants);
  if (!hit) return null;
  const name = rowName(hit);
  press(hit);
  await sleep(500);
  return name;
}

const categoryDialog = () => q('CategoryDialogBody');

async function category(item: ListingWork['item']): Promise<string | null> {
  const want = mercariCategory(item);
  const field = q('SellCategoryFieldButton');
  if (!field) return null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    press(field);
    if (!(await waitFor(() => rows().length > 0 && categoryDialog(), 5000))) continue;
    // The picker opens on the last place it was: go back to the departments.
    for (let i = 0; i < 3 && !rows().some(r => rowName(r) === 'Women'); i += 1) {
      const back = [...document.querySelectorAll<HTMLElement>('[data-testid="CategoryDialogBody"] button[aria-label="Back"]')].filter(shown).pop();
      if (!back) break;
      press(back);
      await sleep(450);
    }
    const path: string[] = [];
    for (const level of [[want.department], want.category]) {
      const got = await pressRow(level);
      if (!got) break;
      path.push(got);
    }
    if (path.length === 2 && categoryDialog()) {
      const names = rows().map(rowName);
      const all = names.find(n => n === `All ${path[1]}`) ?? names.find(n => /^All /.test(n));
      const sub = await pressRow(want.subcategory.length ? want.subcategory : []);
      if (!sub && all) await pressRow([all]);
    }
    const closed = await waitFor(() => !categoryDialog(), 3000);
    const shownPath = text(q('SellCategoryFieldButton'));
    if (closed && norm(shownPath).startsWith(norm(want.department))) return shownPath;
    // Stuck halfway: close it and try once more from the top.
    const close = document.querySelector<HTMLElement>('[data-testid="DialogWrapper"] button[aria-label="Close"]');
    if (close) press(close);
    await sleep(600);
  }
  return null;
}

/** Open a listbox input: it opens on focus, so blur it first in case it already had focus. */
async function openList(input: HTMLInputElement, listId: string): Promise<HTMLElement[]> {
  const options = () => [...document.querySelectorAll<HTMLElement>(`ul#${listId} [role="option"]`)];
  input.blur();
  await sleep(150);
  input.focus();
  let found = await waitFor(() => (options().length ? options() : null), 2500);
  if (!found) {
    press(input);
    found = await waitFor(() => (options().length ? options() : null), 2500);
  }
  return found ?? [];
}

async function brand(name: string | null): Promise<string | null> {
  const input = q<HTMLInputElement>('Brand');
  if (!input || !name) return null;
  if (norm(input.value) === norm(name)) return input.value;
  typeText(input, name);
  const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"][id^="sellBrandOptions"]')].filter(shown);
  const want = norm(name);
  // The list opens with every brand on focus and filters as you type, so wait for a row that names this one.
  const match = () => options().find(o => norm(text(o)) === want) ?? options().find(o => norm(text(o)).startsWith(want)) ?? null;
  const hit = (await waitFor(() => options().find(o => norm(text(o)) === want) ?? null, 4000)) ?? match();
  if (!hit) {
    typeText(input, '');
    input.blur();
    return null;
  }
  press(hit);
  await sleep(500);
  return input.value || null;
}

async function condition(item: ListingWork['item']): Promise<string | null> {
  const group = document.querySelector('[aria-label="Condition"]');
  if (!group) return null;
  const labels = [...group.querySelectorAll<HTMLElement>('label')];
  const hit = pickOption(labels, l => text(l).split('\n')[0]!, conditionWords('mercari', item));
  if (!hit) return null;
  press(hit.querySelector('input') ?? hit);
  await sleep(300);
  return hit.querySelector<HTMLInputElement>('input')?.checked ? text(hit).split('\n')[0]! : null;
}

let sizesSeen: string[] = [];

async function size(value: string | null): Promise<string | null> {
  const input = q<HTMLInputElement>('Size');
  if (!input || !value) return null;
  const options = await openList(input, 'itemSizeId');
  sizesSeen = options.map(o => text(o));
  const hit = pickSize(options, o => text(o), value);
  if (!hit) {
    input.blur();
    return null;
  }
  press(hit);
  await sleep(500);
  return input.value || null;
}

async function smartPricingOff(): Promise<boolean> {
  const toggle = q('SmartPricingButton');
  if (!toggle || toggle.getAttribute('aria-pressed') !== 'true') return true;
  press(toggle);
  const confirm = await waitFor(() => (shown(q('SmartPricingTurnOffButton')) ? q('SmartPricingTurnOffButton') : null), 4000);
  if (confirm) press(confirm);
  return Boolean(await waitFor(() => q('SmartPricingButton')?.getAttribute('aria-pressed') === 'false', 3000));
}

/**
 * Buyer pays shipping, as on Poshmark, Depop and Vinted: pileGo's price is the
 * seller's price everywhere. Mercari's "free shipping" default would take the
 * label (about $8 for a tee) out of it.
 */
async function buyerPaysShipping(): Promise<boolean> {
  const trigger = () => document.querySelector<HTMLElement>('div#ShippingPayerOption, [data-testid="ShippingPayerOption"]:not(ul)');
  const isNo = () => /^no$/i.test(text(trigger()));
  // A new price or label quote can put Mercari's default back a moment later, so check it holds.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!trigger()) return false;
    if (!isNo()) {
      press(trigger()!);
      const no = await waitFor(() => (shown(q('FreeShippingNoButton')) ? q('FreeShippingNoButton') : null), 3000);
      if (!no) return false;
      // A plain click shows "No", then Mercari's shipping suggestion puts "Yes" back.
      pressLikeMouse(no);
      await waitFor(isNo, 3000);
    }
    await sleep(1500);
    if (isNo()) return true;
  }
  return false;
}

const visibleDialog = (testid: string) => [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(d => shown(d) && d.querySelector(`[data-testid="${testid}"]`)) ?? null;

/**
 * Mercari ships from the seller's saved address. A seller without one gets
 * the address from pileGo's setup added to their Mercari account.
 */
async function shipsFrom(work: ListingWork): Promise<string | null> {
  const where = () => text(q('ShipsFrom')).match(/\d{5}/)?.[0] ?? null;
  if (where()) return where();
  const address = addressParts(work.seller_address);
  const edit = q('ShipsFromEditButton');
  if (!address || address.country !== 'US' || !edit) return null;
  press(edit);
  const list = await waitFor(() => visibleDialog('AddAddressButton'), 5000);
  if (!list) return null;
  const saved = list.querySelector<HTMLElement>('[data-testid="EditAddress"]');
  if (!saved) {
    press(list.querySelector<HTMLElement>('[data-testid="AddAddressButton"]')!);
    const form = await waitFor(() => visibleDialog('AddressFirstName'), 5000);
    if (!form) return null;
    const field = (testid: string, value: string) => {
      const el = form.querySelector<HTMLInputElement>(`[data-testid="${testid}"]`);
      if (el && value) setValue(el, value);
    };
    field('AddressFirstName', address.first_name);
    field('AddressLastName', address.last_name || address.first_name);
    field('AddressLine1', address.line1);
    field('AddressLine2', address.line2);
    field('AddressZipCode', address.postal_code);
    field('AddressCity', address.city);
    const state = form.querySelector<HTMLElement>('[data-testid="AddressState"]');
    if (state) {
      press(state);
      const option = await waitFor(
        () => [...document.querySelectorAll<HTMLElement>('[data-testid="AddressState-option"]')].find(o => norm(text(o)) === norm(address.state_name)) ?? null,
        3000,
      );
      if (option) press(option);
      await sleep(300);
    }
    const save = form.querySelector<HTMLElement>('[data-testid="SaveButton"]');
    if (!save) return null;
    press(save);
    await waitFor(() => !visibleDialog('AddressFirstName'), 10_000);
  }
  // The address list stays open over the form; the new address is the default.
  const close = visibleDialog('MyAddressesDialog-Close')?.querySelector<HTMLElement>('[data-testid="MyAddressesDialog-Close"]');
  if (close) press(close);
  return waitFor(where, 8000);
}

function errors(): string[] {
  const out = new Set<string>();
  for (const el of document.querySelectorAll<HTMLElement>('main [data-testid$="Error"], main [role="alert"], [data-testid="DialogWrapper"] [role="alert"]')) {
    const t = text(el);
    if (t && t.length < 160 && shown(el)) out.add(t);
  }
  return [...out];
}

/** A dialog Mercari put up after List was pressed, such as a phone check, for the error message. */
function dialogText(): string | null {
  const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(shown);
  return dialog ? text(dialog).replace(/\s+/g, ' ').slice(0, 160) : null;
}

export const fillMercari: Driver = async (work: ListingWork, files: File[], ctx: DriverContext) => {
  const tally = new Tally();
  const { item, listing } = work;

  ctx.step('Waiting for Mercari’s form…');
  const ready = await waitFor(() => q('Title') || pageError() || /\/login/.test(location.pathname), 30_000);
  if (/\/login/.test(location.pathname)) return tally.result(false, 'Mercari wants you to log in. Log in to Mercari in this browser, then try again.');
  const broken = pageError();
  if (broken) {
    tally.retry = true;
    return tally.result(false, `Mercari’s server had a problem (${broken}).`);
  }
  if (!ready) return tally.result(false, 'Mercari’s sell form did not load. Are you logged in to Mercari?');
  await clearDialogs();

  ctx.check();
  ctx.step('Adding photos…');
  tally.photos = await photos(files);
  tally.ok('photos', tally.photos);
  await clearDialogs();

  ctx.check();
  ctx.step('Title and description…');
  const title = q<HTMLInputElement>('Title')!;
  setValue(title, [...listing.title].slice(0, 80).join('').trim());
  tally.ok('title', title.value);
  const description = q<HTMLTextAreaElement>('Description');
  if (description) setValue(description, [...listing.description].slice(0, 1000).join(''));
  tally.ok('description', description?.value);

  ctx.check();
  ctx.step('Picking the category…');
  tally.ok('category', await category(item));
  // Size and the shipping suggestion follow the category.
  await sleep(800);

  ctx.check();
  ctx.step('Brand, condition and size…');
  if (item.brand) tally.ok('brand', await brand(item.brand));
  tally.ok('condition', await condition(item));
  const hasSize = Boolean(q('Size'));
  if (hasSize && item.size) tally.ok('size', await size(item.size));

  ctx.check();
  ctx.step('Price and shipping…');
  const price = q<HTMLInputElement>('Price');
  if (price && listing.price != null) setValue(price, String(listing.price));
  tally.ok('price', price && Number(price.value.replace(/[^0-9.]/g, '')) > 0);
  await smartPricingOff();
  tally.ok('ships from', await shipsFrom(work));
  // Mercari picks the label once it knows the title and category.
  const label = await waitFor(() => q<HTMLInputElement>('SelectShipping')?.value.trim() || null, 10_000);
  tally.ok('shipping', label);

  const needed = ['photos', 'title', 'description', 'category', 'condition', 'price', 'ships from', 'shipping'];
  if (hasSize && item.size) needed.push('size');
  const blocking = needed.filter(n => tally.missing.includes(n));
  if (blocking.length) {
    const said = serverAlerts()[0];
    if (said) {
      tally.retry = true;
      return tally.result(false, `Mercari’s server had a problem (${said}).`);
    }
    const hints: string[] = [];
    if (blocking.includes('ships from')) hints.push('Mercari needs a ship-from address: add yours in pileGo’s setup and pileGo will add it to Mercari.');
    if (blocking.includes('size') && item.size) hints.push(`The item's size is ${item.size}; Mercari offered ${sizesSeen.slice(0, 12).join(', ') || 'no sizes'}.`);
    return tally.result(false, hints.join(' ') || undefined);
  }

  // Last, since a new shipping quote resets it.
  tally.ok('buyer pays shipping', await buyerPaysShipping());
  await smartPricingOff();

  ctx.check();
  let list = q<HTMLButtonElement>('ListButton');
  if (!list || !shown(list)) return tally.result(false, 'Could not find Mercari’s List button.');
  if (!(await ctx.beforePost())) return tally.result(false);
  await buyerPaysShipping();
  ctx.step('Listing on Mercari…');
  for (let attempt = 1; ; attempt += 1) {
    const before = new Set<Element>(serverAlertEls());
    press(list);
    let said: string | null = null;
    const pressedAt = Date.now();
    const outcome = await waitFor(
      () => {
        if (leftForm('mercari', location.href)) return 'posted';
        if (shown(q('PaymentWarningModal'))) return 'payment';
        // Some other one-time check that holds the form, such as a phone number.
        if (Date.now() - pressedAt > 8000 && dialogText()) return 'dialog';
        said = newServerAlert(before) ?? pageError();
        if (said) return 'server';
        return errors().some(e => !isServerError(e)) ? 'refused' : null;
      },
      60_000,
      500,
    );
    if (outcome === 'posted') return tally.result(true);
    if (outcome === 'payment') {
      return tally.result(
        false,
        'Mercari wants a payment card on your account before your first listing. Add one once on Mercari (Account › Payment methods), then pileGo can list there by itself.',
      );
    }
    if (outcome === 'dialog') return tally.result(false, `Mercari asked: “${dialogText()}”`);
    if (outcome !== 'server') break;
    const again = q<HTMLButtonElement>('ListButton');
    if (attempt >= 2 || !again || !shown(again)) {
      return tally.result(false, `Mercari’s server refused the listing (${said}). It may have gone up anyway, so check your Mercari listings before trying again.`);
    }
    ctx.step('Mercari’s server had a problem. Trying once more in 5 seconds…');
    await sleep(5000);
    ctx.check();
    ctx.step('Listing on Mercari…');
    list = again;
  }
  const why = errors();
  const dialog = dialogText();
  return tally.result(
    false,
    why.length ? `Mercari wants: ${why.slice(0, 4).join('; ')}.` : dialog ? `Mercari asked: “${dialog}”` : 'Mercari did not confirm the listing.',
  );
};
