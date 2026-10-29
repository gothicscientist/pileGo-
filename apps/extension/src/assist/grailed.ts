// Fills Grailed's sell form from top to bottom and presses Publish.
//
// Grailed's form (grailed.com/sell/new, October 2026) is React with
// redux-form. Department/category, subcategory, size, colour, condition and
// style are Radix dropdown menus: they open on pointerdown, not click, and a
// [role=menuitem] row picks. The department menu remembers the last
// department and shows a "Back to departments" button. Designer is a search
// box whose rows pick on mousedown and show as chosen once the box loses
// focus. Photos go to the first empty `#photo_input_N` slot. Smart pricing
// (on by default) cuts the price 10% a week, so it goes off: pileGo owns the
// price.

import { sleep } from '../shared/browser.ts';
import type { ListingWork } from '../shared/messages.ts';
import { addressParts } from './address.ts';
import { conditionWords, grailedCategory, grailedColour, grailedStyle, pickSize } from './choices.ts';
import { giveFiles, isServerError, newServerAlert, norm, pageError, pickOption, press, serverAlertEls, serverAlerts, setValue, shown, text, typeText, waitFor } from './dom.ts';
import { Tally, type Driver, type DriverContext } from './driver.ts';
import { leftForm } from './sites.ts';

const MAX_PHOTOS = 20;

const form = () => document.querySelector<HTMLInputElement>('input[name="title"]')?.closest('form') ?? null;

/** The form's dropdown buttons, in order: category, subcategory, size, colour, condition, style. */
const menus = () => [...(form()?.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]') ?? [])];

const menuItems = () => [...document.querySelectorAll<HTMLElement>('[role="menu"][data-state="open"] [role="menuitem"]')].filter(shown);
const itemName = (el: HTMLElement) => text(el).split('\n')[0]!.trim();

async function openMenu(button: HTMLElement | undefined): Promise<HTMLElement[]> {
  if (!button || (button as HTMLButtonElement).disabled) return [];
  const win = button.ownerDocument.defaultView ?? window;
  if (button.getAttribute('data-state') !== 'open') {
    button.scrollIntoView?.({ block: 'center' });
    button.dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse' }));
  }
  return (await waitFor(() => (menuItems().length ? menuItems() : null), 3000)) ?? [];
}

async function closeMenu() {
  const open = document.querySelector<HTMLElement>('[role="menu"][data-state="open"]');
  if (!open) return;
  const win = open.ownerDocument.defaultView ?? window;
  open.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  await sleep(300);
}

/** Pick a row in an open menu; the menu closes or moves to the next level. */
async function pickItem(wants: string[], label: (el: HTMLElement) => string = itemName): Promise<string | null> {
  const hit = pickOption(menuItems(), label, wants);
  if (!hit) return null;
  const name = itemName(hit);
  press(hit);
  await sleep(450);
  return name;
}

/** What a dropdown shows once something is picked; its placeholder otherwise. */
const shows = (i: number) => text(menus()[i]);

function photoCount(): number {
  return [...(form()?.querySelectorAll('img[alt="Listing"]') ?? [])].filter(shown).length;
}

async function photos(files: File[]): Promise<number> {
  const wanted = files.slice(0, MAX_PHOTOS);
  if (!wanted.length) return 0;
  const start = photoCount();
  let left = wanted;
  for (let attempt = 0; attempt < 6 && left.length; attempt += 1) {
    const slots = [...document.querySelectorAll<HTMLInputElement>('input[type="file"][id^="photo_input_"]')];
    const input = slots[0];
    if (!input) break;
    const batch = left.slice(0, Math.max(1, slots.length));
    const before = photoCount();
    giveFiles(input, batch);
    const after = await waitFor(() => (photoCount() >= before + batch.length ? photoCount() : null), 30_000, 500);
    const added = (after ?? photoCount()) - before;
    if (added > 0) left = left.slice(added);
    else await sleep(2000);
  }
  return photoCount() - start;
}

async function category(item: ListingWork['item']): Promise<{ category: string | null; subcategory: string | null }> {
  const want = grailedCategory(item);
  let chosen: string | null = null;
  for (let attempt = 0; attempt < 2 && !chosen; attempt += 1) {
    const items = await openMenu(menus()[0]);
    if (!items.length) continue;
    if (!items.some(i => itemName(i) === want.department)) {
      const back = document.querySelector<HTMLElement>('[role="menu"][data-state="open"] [data-testid="back-button"]');
      if (back) {
        press(back);
        await waitFor(() => menuItems().some(i => itemName(i) === want.department), 2000);
      }
    }
    if (!(await pickItem([want.department]))) {
      await closeMenu();
      continue;
    }
    chosen = await pickItem(want.category);
    if (!chosen) await closeMenu();
  }
  if (!chosen) return { category: null, subcategory: null };
  await waitFor(() => !menus()[1]?.disabled, 3000);
  await openMenu(menus()[1]);
  const sub = (await pickItem(want.subcategory)) ?? (await pickItem(['Other', 'Miscellaneous']));
  if (!sub) await closeMenu();
  const shown1 = shows(0);
  return { category: norm(shown1).startsWith(norm(want.department)) ? shown1 : null, subcategory: sub ? shows(1) : null };
}

async function designer(name: string | null): Promise<string | null> {
  const input = document.getElementById('designer-autocomplete') as HTMLInputElement | null;
  if (!input) return null;
  const clear = () => document.querySelector('button[aria-label="Clear selected designer"]');
  if (clear() && norm(input.value) === norm(name)) return input.value;
  const area = input.parentElement?.parentElement ?? form()!;
  const rows = () => [...area.querySelectorAll<HTMLElement>('ul[role="menu"] li[role="menuitem"]')].filter(shown);
  input.focus();
  typeText(input, name ?? '');
  const want = norm(name);
  let list: HTMLElement[] = [];
  if (want) {
    // The rows come back from a search; wait for one that names the designer.
    list = (await waitFor(() => (rows().some(r => norm(itemName(r)).startsWith(want)) ? rows() : null), 6000)) ?? rows();
  } else {
    list = (await waitFor(() => (rows().length ? rows() : null), 3000)) ?? [];
  }
  const hit =
    (want && (list.find(r => norm(itemName(r)) === want) ?? list.find(r => norm(itemName(r)).startsWith(want)))) ||
    // An unknown or missing brand goes in as "Designer not listed / Not sure".
    list.find(r => /not listed|not sure/i.test(text(r))) ||
    null;
  if (!hit) {
    input.blur();
    return null;
  }
  const win = hit.ownerDocument.defaultView ?? window;
  hit.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
  await sleep(400);
  input.blur();
  await waitFor(() => clear(), 2000);
  return clear() ? input.value || 'Designer not listed' : null;
}

let sizesSeen: string[] = [];

async function size(value: string | null): Promise<string | null> {
  const button = menus()[2];
  if (!button || button.disabled) return null;
  const items = await openMenu(button);
  sizesSeen = items.map(itemName);
  const hit = pickSize(items, itemName, value) ?? (value ? null : items.find(i => /one size/i.test(itemName(i))) ?? null);
  if (!hit) {
    await closeMenu();
    return null;
  }
  press(hit);
  await sleep(400);
  return /select size/i.test(shows(2)) ? null : shows(2);
}

async function pickIn(index: number, wants: string[], placeholder: RegExp): Promise<string | null> {
  if (!wants.length) return null;
  await openMenu(menus()[index]);
  const got = await pickItem(wants);
  if (!got) await closeMenu();
  return placeholder.test(shows(index)) ? null : shows(index);
}

async function smartPricingOff(): Promise<void> {
  const box = document.querySelector<HTMLInputElement>('input[name="smartPricing.enabled"]');
  if (box?.checked) {
    press(box);
    await sleep(300);
  }
}

const addressDialog = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(d => shown(d) && /address/i.test(text(d))) ?? null;

/** Fill Grailed's add-address form with the address from pileGo's setup and save it. */
async function addAddress(dialog: HTMLElement, work: ListingWork): Promise<boolean> {
  const address = addressParts(work.seller_address);
  const add = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(b => /add new address/i.test(text(b)));
  if (!address || !add) return false;
  press(add);
  const form = await waitFor(() => addressDialog()?.querySelector('#line1')?.closest('form') ?? null, 5000);
  if (!form) return false;
  const field = (id: string, value: string) => {
    const el = form.querySelector<HTMLInputElement>(`#${id}`);
    if (el && value) setValue(el, value);
  };
  // Country first: it can change which state field the form shows.
  const country = form.querySelector<HTMLSelectElement>('select#countryCode');
  if (country && country.value !== address.country && [...country.options].some(o => o.value === address.country)) {
    const win = country.ownerDocument.defaultView ?? window;
    Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, 'value')?.set?.call(country, address.country);
    country.dispatchEvent(new win.Event('change', { bubbles: true }));
  }
  await sleep(300);
  field('recipientName', address.full_name);
  field('line1', address.line1);
  field('line2', address.line2);
  field('city', address.city);
  field('state', address.country === 'US' ? address.state_code : address.state);
  field('postalCode', address.postal_code);
  const makeDefault = form.querySelector<HTMLInputElement>('input[name="defaultReturn"]');
  if (makeDefault && !makeDefault.checked) press(makeDefault);
  const save = [...form.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].find(b => /save/i.test(text(b)));
  if (!save) return false;
  press(save);
  return Boolean(await waitFor(() => !addressDialog()?.querySelector('#line1'), 10_000));
}

/**
 * Where the item ships from. Grailed fills in the seller's default return
 * address; a seller without one gets the address from pileGo's setup added.
 */
async function shipFrom(work: ListingWork): Promise<string | null> {
  const f = form();
  if (!f) return null;
  const choose = () => [...(form()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(b => /^select address$/i.test(text(b)));
  if (!choose()) return 'set';
  press(choose()!);
  let dialog = await waitFor(addressDialog, 4000);
  if (!dialog) return null;
  if (/no saved addresses/i.test(text(dialog))) {
    if (!(await addAddress(dialog, work))) {
      const close = addressDialog()?.querySelector<HTMLElement>('[data-testid="modal-close"], button[aria-label="Close"]');
      if (close) press(close);
      return null;
    }
    dialog = (await waitFor(addressDialog, 3000)) ?? null;
  }
  if (dialog) {
    // Pick the saved address if Grailed has not, then Done.
    const choices = [...dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    if (choices.length && !choices.some(c => c.checked)) press(choices[0]!);
    await sleep(300);
    const done = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(b => /^done$/i.test(text(b)) && !b.disabled);
    if (done) press(done);
    else {
      const close = dialog.querySelector<HTMLElement>('[data-testid="modal-close"], button[aria-label="Close"]');
      if (close) press(close);
    }
    await waitFor(() => !addressDialog(), 4000);
  }
  return choose() ? null : 'set';
}

function errors(): string[] {
  const out = new Set<string>();
  const f = form();
  // Grailed wraps every field in an "input-with-error" box, so only leaf messages count.
  for (const el of f?.querySelectorAll<HTMLElement>('[class*="error" i], [role="alert"]') ?? []) {
    if (el.querySelector('input, textarea, select, button, label')) continue;
    const t = text(el);
    if (t && t.length < 160 && shown(el)) out.add(t);
  }
  return [...out];
}

/** A dialog Grailed opens instead of publishing, such as its one-time phone check. */
function blockingDialog(): string | null {
  const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(d => shown(d) && !/address/i.test(text(d).slice(0, 80)));
  return dialog ? text(dialog).split('\n').filter(Boolean).slice(0, 2).join(' ').slice(0, 160) : null;
}

export const fillGrailed: Driver = async (work: ListingWork, files: File[], ctx: DriverContext) => {
  const tally = new Tally();
  const { item, listing } = work;

  ctx.step('Waiting for Grailed’s form…');
  const ready = await waitFor(() => (form() && menus().length) || pageError() || /\/users\/sign_up|\/login/.test(location.pathname), 30_000);
  if (/\/users\/sign_up|\/login/.test(location.pathname)) return tally.result(false, 'Grailed wants you to log in. Log in to Grailed in this browser, then try again.');
  const broken = pageError();
  if (broken) {
    tally.retry = true;
    return tally.result(false, `Grailed’s server had a problem (${broken}).`);
  }
  if (!ready) return tally.result(false, 'Grailed’s sell form did not load. Are you logged in to Grailed?');

  ctx.check();
  ctx.step('Picking the category…');
  const cat = await category(item);
  tally.ok('category', cat.category);
  tally.ok('subcategory', cat.subcategory);

  ctx.check();
  ctx.step('Designer and size…');
  await waitFor(() => !(document.getElementById('designer-autocomplete') as HTMLInputElement | null)?.disabled, 3000);
  tally.ok('designer', await designer(item.brand));
  tally.ok('size', await size(item.size));

  ctx.check();
  ctx.step('Title, colour and condition…');
  const title = document.querySelector<HTMLInputElement>('input[name="title"]')!;
  // Grailed shows the designer above the item name, so the name leaves it out.
  const name = item.brand && norm(listing.title).startsWith(`${norm(item.brand)} `) ? listing.title.slice(item.brand.length).replace(/^[\s\-–:|]+/, '') : listing.title;
  const shortName = [...name].slice(0, 60).join('').trim();
  setValue(title, shortName.charAt(0).toUpperCase() + shortName.slice(1));
  tally.ok('title', title.value);
  const colour = grailedColour(item);
  if (colour) tally.ok('colour', await pickIn(3, [colour], /select a colou?r/i));
  tally.ok('condition', await pickIn(4, conditionWords('grailed', item), /item condition/i));

  ctx.check();
  ctx.step('Description and style…');
  const description = document.querySelector<HTMLTextAreaElement>('textarea[name="description"]');
  if (description) setValue(description, [...listing.description].slice(0, 1500).join(''));
  tally.ok('description', description?.value);
  const style = grailedStyle(item);
  if (style) tally.ok('style', await pickIn(5, [style], /select a style/i));

  ctx.check();
  ctx.step('Price and shipping…');
  const price = document.querySelector<HTMLInputElement>('input[name="price"]');
  if (price && listing.price != null) setValue(price, String(Math.round(listing.price)));
  tally.ok('price', price && Number(price.value) > 0);
  await smartPricingOff();
  tally.ok('ship from', await shipFrom(work));

  ctx.check();
  ctx.step('Adding photos…');
  tally.photos = await photos(files);
  tally.ok('photos', tally.photos);

  const blocking = ['photos', 'title', 'description', 'category', 'subcategory', 'designer', 'size', 'condition', 'price', 'ship from'].filter(n =>
    tally.missing.includes(n),
  );
  if (blocking.length) {
    const said = serverAlerts()[0];
    if (said) {
      tally.retry = true;
      return tally.result(false, `Grailed’s server had a problem (${said}).`);
    }
    const hints: string[] = [];
    if (blocking.includes('ship from')) hints.push('Grailed needs a return address: add yours in pileGo’s setup and pileGo will add it to Grailed.');
    if (blocking.includes('size') && item.size) hints.push(`The item's size is ${item.size}; Grailed offered ${sizesSeen.slice(0, 12).join(', ') || 'no sizes'}.`);
    return tally.result(false, hints.join(' ') || undefined);
  }

  ctx.check();
  let publish = [...(form()?.querySelectorAll<HTMLButtonElement>('button[type="submit"]') ?? [])].find(b => /^publish$/i.test(text(b)) && shown(b));
  if (!publish) return tally.result(false, 'Could not find Grailed’s Publish button.');
  if (!(await ctx.beforePost())) return tally.result(false);
  ctx.step('Publishing on Grailed…');
  for (let attempt = 1; ; attempt += 1) {
    const before = new Set<Element>(serverAlertEls());
    press(publish);
    let said: string | null = null;
    const outcome = await waitFor(
      () => {
        if (leftForm('grailed', location.href)) return 'posted';
        said = newServerAlert(before) ?? pageError();
        if (said) return 'server';
        if (blockingDialog()) return 'dialog';
        return errors().some(e => !isServerError(e)) ? 'refused' : null;
      },
      90_000,
      500,
    );
    if (outcome === 'posted') return tally.result(true);
    if (outcome === 'dialog') {
      const asked = blockingDialog() ?? '';
      return tally.result(
        false,
        /verify your phone/i.test(asked)
          ? 'Grailed wants you to verify your phone number once before your first listing. Do that on Grailed, then pileGo can publish there by itself.'
          : `Grailed asked: “${asked}”`,
      );
    }
    if (outcome !== 'server') break;
    const again = [...(form()?.querySelectorAll<HTMLButtonElement>('button[type="submit"]') ?? [])].find(b => /^publish$/i.test(text(b)) && shown(b));
    if (attempt >= 2 || !again) {
      return tally.result(false, `Grailed’s server refused the listing (${said}). It may have gone up anyway, so check your Grailed listings before trying again.`);
    }
    ctx.step('Grailed’s server had a problem. Trying once more in 5 seconds…');
    await sleep(5000);
    ctx.check();
    ctx.step('Publishing on Grailed…');
    publish = again;
  }
  const why = errors();
  return tally.result(false, why.length ? `Grailed wants: ${why.slice(0, 4).join('; ')}.` : 'Grailed did not confirm the listing.');
};
