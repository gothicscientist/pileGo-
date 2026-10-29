// Fills Depop's sell form from top to bottom and presses Post.
//
// Depop's form (depop.com/products/create, October 2026) is React with
// Downshift comboboxes: each field is an input `#<name>-input`, a toggle
// `#<name>-toggle-button` and a list `#<name>-menu` of [role=option] rows.
// Category is a search box whose options sit under MEN / WOMEN / KIDS
// headings; picking one adds the size and attribute fields for it.

import { sleep } from '../shared/browser.ts';
import type { ListingWork } from '../shared/messages.ts';
import {
  conditionWords,
  depopAge,
  depopCategoryTerms,
  depopColours,
  depopDepartment,
  depopPackage,
  depopSource,
  depopStyles,
  sizeWants,
} from './choices.ts';
import { giveFiles, isServerError, norm, pageError, pickOption, press, newServerAlert, serverAlertEls, serverAlerts, setValue, shown, text, typeText, waitFor } from './dom.ts';
import { Tally, type Driver, type DriverContext } from './driver.ts';
import { leftForm } from './sites.ts';

const MAX_PHOTOS = 8;

const byId = (id: string) => document.getElementById(id);
const label = (opt: Element) => text(opt).split('\n')[0]!.trim();

function options(name: string): HTMLElement[] {
  return [...(byId(`${name}-menu`)?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
}

async function openMenu(name: string): Promise<HTMLElement[]> {
  if (byId(`${name}-input`)?.getAttribute('aria-expanded') !== 'true') {
    const toggle = byId(`${name}-toggle-button`) ?? byId(`${name}-input`);
    if (!toggle) return [];
    press(toggle);
  }
  return (await waitFor(() => (options(name).length ? options(name) : null), 3000)) ?? [];
}

function closeMenu(name: string) {
  const input = byId(`${name}-input`);
  // Downshift's Escape clears selectedItem when its reducer has already
  // closed the menu, even if aria-expanded has not caught up yet. Depop's
  // size onChange destructures that null and crashes the whole form into a
  // misleading 500 page. The toggle and blur close without clearing size.
  if (input?.getAttribute('aria-expanded') === 'true') {
    const toggle = byId(`${name}-toggle-button`);
    if (toggle) press(toggle);
  }
  (input as HTMLElement | null)?.blur();
}

/** The field around a combobox: the smallest ancestor that also holds its menu. */
function fieldOf(name: string): HTMLElement | null {
  let node = byId(`${name}-input`);
  const menu = byId(`${name}-menu`);
  while (node && menu && !node.contains(menu)) node = node.parentElement;
  return node;
}

/** Chips already in a multi-select, such as colours Depop guessed from the photos. */
function chips(name: string): Array<{ label: string; remove: HTMLElement }> {
  const field = fieldOf(name);
  if (!field) return [];
  return [...field.querySelectorAll<HTMLElement>('button[aria-label^="Remove "]')].map(b => ({
    label: b.getAttribute('aria-label')!.slice('Remove '.length),
    remove: b,
  }));
}

/** The options each menu last showed, for saying why a field could not be filled. */
const seen = new Map<string, string[]>();

/**
 * Pick one or more options of a Downshift combobox. Chips the item does not
 * want are removed first. Returns what is selected at the end.
 */
async function choose(name: string, wants: string[][], max = wants.length): Promise<string[]> {
  const input = byId(`${name}-input`) as HTMLInputElement | null;
  if (!input) return [];
  const wanted = wants.flat().map(norm);
  for (const chip of chips(name)) {
    if (!wanted.includes(norm(chip.label))) {
      press(chip.remove);
      await sleep(250);
    }
  }
  const picked: string[] = chips(name).map(c => c.label);
  for (const want of wants) {
    if (picked.length >= max) break;
    if (picked.some(p => want.map(norm).includes(norm(p)))) continue;
    // A menu can open empty or stale while the form redraws (after the
    // category changes, say), so look again before giving up on it.
    let hit: HTMLElement | null = null;
    for (let attempt = 0; attempt < 3 && !hit; attempt += 1) {
      if (attempt) {
        closeMenu(name);
        await sleep(700);
      }
      const opts = await openMenu(name);
      seen.set(name, opts.map(label));
      hit = pickOption(opts, label, want);
    }
    if (!hit) continue;
    picked.push(label(hit));
    press(hit);
    await sleep(350);
  }
  closeMenu(name);
  // A single select shows its value in the input once React catches up; check it took.
  // Category/AI updates replace the size input. The old node can stay empty
  // forever even though the replacement correctly displays the selected M.
  const took = () => norm((byId(`${name}-input`) as HTMLInputElement | null)?.value) === norm(picked[0]);
  if (!chips(name).length && picked.length === 1 && !(await waitFor(took, 2000))) {
    const opts = await openMenu(name);
    const hit = opts.find(o => norm(label(o)) === norm(picked[0]));
    if (hit) press(hit);
    closeMenu(name);
    return (await waitFor(took, 2000)) ? picked : [];
  }
  return picked;
}

/** Type into a searchable combobox and pick the best of what comes back. */
async function search(name: string, query: string, pick: (opts: HTMLElement[]) => HTMLElement | null): Promise<string | null> {
  const input = byId(`${name}-input`) as HTMLInputElement | null;
  if (!input) return null;
  typeText(input, query);
  const opts = await waitFor(() => (options(name).length ? options(name) : null), 4000);
  const hit = opts ? pick(opts) : null;
  if (!hit) {
    typeText(input, '');
    closeMenu(name);
    return null;
  }
  const chosen = label(hit);
  press(hit);
  await sleep(500);
  closeMenu(name);
  return chosen;
}

async function category(item: ListingWork['item']): Promise<string | null> {
  const dept = depopDepartment(item).toUpperCase();
  for (const term of depopCategoryTerms(item)) {
    const chosen = await search('group', term, opts => {
      const scored = opts.map(o => {
        // Each option sits in a block whose first line is "MEN > BOTTOMS".
        let block: HTMLElement = o;
        while (block.parentElement && block.parentElement.id !== 'group-menu') block = block.parentElement;
        const heading = text(block).split('\n')[0]!.toUpperCase();
        const name = norm(label(o));
        let score = name === norm(term) ? 10 : ` ${name} `.includes(` ${norm(term)} `) ? 5 : 0;
        if (score && heading.startsWith(dept)) score += 5;
        return { o, score };
      });
      const best = scored.sort((a, b) => b.score - a.score)[0];
      return best && best.score >= 10 ? best.o : null;
    });
    if (chosen) return chosen;
  }
  return null;
}

async function brand(name: string | null): Promise<string | null> {
  if (!name) return null;
  const input = byId('brand-input') as HTMLInputElement | null;
  // Depop may already have selected the brand from the description/photos.
  if (input && norm(input.value) === norm(name) && norm(input.getAttribute('value')) === norm(name)) return name;
  return search('brand', name, opts => {
    const want = norm(name);
    return opts.find(o => norm(label(o)) === want) ?? opts.find(o => norm(label(o)).startsWith(want)) ?? null;
  });
}

function formImages(input: HTMLElement): number {
  const scope = input.closest('form') ?? document.querySelector('main') ?? document.body;
  return [...scope.querySelectorAll('img')].filter(shown).length;
}

/** Photos, checked: a page that has not finished loading drops files silently, so they go again. */
async function photos(files: File[]): Promise<number> {
  const wanted = files.slice(0, MAX_PHOTOS);
  if (!wanted.length) return 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const input = (await waitFor(
      () => (byId('upload-input__input') as HTMLInputElement | null) ?? document.querySelector<HTMLInputElement>('form input[type="file"]'),
      15_000,
    )) as HTMLInputElement | null;
    if (!input) return 0;
    const before = formImages(input);
    giveFiles(input, wanted);
    const after = await waitFor(() => (formImages(input) >= before + wanted.length ? formImages(input) : null), 20_000, 500);
    const added = (after ?? formImages(input)) - before;
    if (added > 0) return added;
    await sleep(2000);
  }
  return 0;
}

/** The international shipping price box that worldwide shipping brings up. */
function internationalPrice(): HTMLInputElement | null {
  return (
    [...document.querySelectorAll<HTMLInputElement>('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"])')].find(
      i => /international/i.test(`${i.id} ${i.name}`) && shown(i),
    ) ?? null
  );
}

function errors(): string[] {
  const out = new Set<string>();
  for (const el of document.querySelectorAll<HTMLElement>('[aria-invalid="true"]')) {
    const id = el.id;
    const name = id ? text(document.querySelector(`label[for="${CSS.escape(id)}"]`)) : '';
    out.add(name || el.getAttribute('aria-label') || el.getAttribute('name') || 'a field');
  }
  for (const el of document.querySelectorAll<HTMLElement>('main [role="alert"], form [class*="error" i]')) {
    const t = text(el);
    if (t && t.length < 120 && shown(el)) out.add(t);
  }
  return [...out];
}

export const fillDepop: Driver = async (work: ListingWork, files: File[], ctx: DriverContext) => {
  const tally = new Tally();
  const { item, listing } = work;

  ctx.step('Waiting for Depop’s form…');
  const ready = await waitFor(() => (byId('group-input') && byId('description')) || pageError(), 30_000);
  const broken = pageError();
  if (broken) {
    tally.retry = true;
    return tally.result(false, `Depop’s server had a problem (${broken}).`);
  }
  if (!ready) return tally.result(false, 'Depop’s sell form did not load. Are you logged in to Depop?');

  ctx.check();
  ctx.step('Adding photos…');
  tally.photos = await photos(files);
  tally.ok('photos', tally.photos);

  ctx.check();
  ctx.step('Writing the description…');
  const description = byId('description') as HTMLTextAreaElement;
  // By characters, not UTF-16 units: half an emoji at the cut is text Depop's server cannot store.
  setValue(description, [...listing.description].slice(0, 1000).join(''));
  tally.ok('description', description.value);

  ctx.check();
  ctx.step('Picking the category…');
  const cat = await category(item);
  tally.ok('category', cat);
  // The size and attribute fields appear once a category is set.
  if (cat) await waitFor(() => byId('variants-input'), 3000);

  ctx.check();
  if (item.materials.length && byId('attributes.material-input')) {
    tally.ok('material', await choose('attributes.material', item.materials.map(m => [m.replace(/\b\d+(?:\.\d+)?\s*%\s*/g, '').trim()]), 3));
  }

  ctx.step('Brand, condition and colour…');
  if (item.brand) tally.ok('brand', await brand(item.brand));
  tally.ok('condition', await choose('condition', [conditionWords('depop', item)]));
  const colours = depopColours(item);
  if (colours.length) tally.ok('colour', await choose('colour', colours.map(c => [c]), 2));

  ctx.check();
  if (byId('variants-input') && item.size) tally.ok('size', await choose('variants', [sizeWants(item.size)]));

  ctx.step('Source, age and style…');
  tally.ok('source', await choose('source', [depopSource(item)]));
  tally.ok('age', await choose('age', [depopAge(item)]));
  tally.ok('style', await choose('style', depopStyles(item).map(s => [s]), 3));

  ctx.check();
  ctx.step('Price and shipping…');
  const price = byId('priceAmount__input') as HTMLInputElement | null;
  if (price && listing.price != null) setValue(price, String(listing.price));
  tally.ok('price', price && Number(price.value) > 0);

  // Worldwide shipping stays as the seller left it. Depop's prepaid labels are
  // domestic only, so worldwide needs its own international price; switched on
  // without one, every Post came back as a 500. pileGo has no price to give it,
  // so a worldwide switch that is on with the price left empty goes off.
  const worldwide = document.querySelector<HTMLInputElement>('input[name="isInternationalShippingEnabled"]');
  if (worldwide?.checked && internationalPrice()?.value.trim() === '') {
    press(worldwide);
    await sleep(700);
  }
  // Depop suggests a package size from the category's typical weight and warns
  // when it is overridden, so its own suggestion stays.
  const suggested = (byId('shippingMethods-input') as HTMLInputElement | null)?.value.trim();
  tally.ok('package size', suggested || (await choose('shippingMethods', [depopPackage(item)])));

  // Without these Depop refuses the listing; stop and say what is missing.
  const needed = ['photos', 'description', 'category', 'condition', 'price'];
  if (byId('variants-input') && item.size) needed.push('size');
  const blocking = needed.filter(n => tally.missing.includes(n));
  if (blocking.length) {
    // A photo upload Depop's server refused is worth a fresh form, not the seller's time.
    const said = serverAlerts()[0];
    if (said) {
      tally.retry = true;
      return tally.result(false, `Depop’s server had a problem (${said}).`);
    }
    const sizes = seen.get('variants');
    const hint =
      blocking.includes('size') && item.size
        ? ` The item's size is ${item.size}; Depop offered ${sizes?.length ? sizes.slice(0, 12).join(', ') : 'no sizes'}.`
        : '';
    return tally.result(false, hint.trim() || undefined);
  }

  ctx.check();
  let post = [...document.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].find(b => text(b) === 'Post' && shown(b));
  if (!post) return tally.result(false, 'Could not find Depop’s Post button.');
  if (!(await ctx.beforePost())) return tally.result(false);
  ctx.step('Posting on Depop…');
  // A 500 that a second press does not clear comes from what the form sends,
  // and sending it again cannot fix that; a Post that failed can also have gone
  // through. So Post is pressed at most twice, then the form goes to the seller
  // instead of a fresh form or a later retry.
  for (let attempt = 1; ; attempt += 1) {
    const before = new Set<Element>(serverAlertEls());
    press(post);
    let said: string | null = null;
    const outcome = await waitFor(
      () => {
        if (leftForm('depop', location.href)) return 'posted';
        said = newServerAlert(before) ?? pageError();
        if (said) return 'server';
        // A 500 toast left from the last try is not Depop refusing the form.
        return errors().some(e => !isServerError(e)) ? 'refused' : null;
      },
      45_000,
      500,
    );
    if (outcome === 'posted') return tally.result(true);
    if (outcome !== 'server') break;
    const again = [...document.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].find(b => text(b) === 'Post' && shown(b));
    if (attempt >= 2 || !again) {
      return tally.result(
        false,
        `Depop’s server refused the post (${said}). It may have gone up anyway, so check your Depop listings before posting again.`,
      );
    }
    ctx.step('Depop’s server had a problem. Trying once more in 5 seconds…');
    await sleep(5000);
    ctx.check();
    ctx.step('Posting on Depop…');
    post = again;
  }
  const why = errors();
  return tally.result(false, why.length ? `Depop wants: ${why.slice(0, 4).join('; ')}.` : 'Depop did not confirm the listing.');
};
