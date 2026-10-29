// Runs in every Vinted tab. Does nothing until the background worker hands it
// a job, then talks to Vinted the way Vinted's own upload form does.

import { between, errorText, ext, fromBase64, sleep, uuid } from '../shared/browser.ts';
import type { ListingWork, VintedOutcome, VintedRequest } from '../shared/messages.ts';
import * as api from './api.ts';
import {
  buildDraft,
  catalogKey,
  forCompletion,
  matchBrand,
  matchCatalog,
  matchColours,
  matchSize,
  type CatalogNode,
  type VintedIds,
  type WardrobeItem,
} from './map.ts';

/** A pause between steps, so a listing takes as long as a quick person would. */
const step = () => sleep(between(900, 2400));

let catalogTree: CatalogNode[] | null = null;
let colourList: Array<{ id: number; title: string }> | null | undefined;

async function resolveIds(work: ListingWork): Promise<{ ids: VintedIds; learned: Record<string, unknown>; missing: string[] }> {
  const learned: Record<string, unknown> = {};
  const missing: string[] = [];
  const key = catalogKey(work.item);

  let catalog_id = (work.learned[`catalog:${key}`] as number | undefined) ?? null;
  if (!catalog_id) {
    catalogTree ??= await api.catalogs();
    const hit = catalogTree ? matchCatalog(catalogTree, { ...work.item, title: work.listing.title }) : null;
    if (hit) {
      catalog_id = hit.id;
      learned[`catalog:${key}`] = hit.id;
    } else missing.push('category');
  }

  let brand_id: number | null = null;
  const brand = work.item.brand?.trim() || null;
  if (brand) {
    const known = work.learned[`brand:${brand.toLowerCase()}`] as number | undefined;
    if (known) brand_id = known;
    else {
      await step();
      const hit = matchBrand(await api.brands(brand), brand);
      if (hit) {
        brand_id = hit.id;
        learned[`brand:${brand.toLowerCase()}`] = hit.id;
      }
    }
  }

  let size_id: number | null = null;
  if (catalog_id && work.item.size) {
    await step();
    size_id = matchSize(await api.sizeGroups(catalog_id).catch(() => []), work.item.size);
    if (size_id == null) missing.push('size');
  }

  if (colourList === undefined) colourList = await api.colours().catch(() => null);
  const color_ids = matchColours(work.item.colors, colourList ?? null);

  return {
    ids: { catalog_id, brand_id, brand, size_id, color_ids, is_unisex: work.item.department === 'unisex' },
    learned,
    missing,
  };
}

async function uploadPhotos(work: ListingWork, sessionId: string) {
  const photos = [];
  for (const p of work.photos.slice(0, 20)) {
    photos.push(await api.uploadPhoto(fromBase64(p.data, p.type), sessionId));
    await sleep(between(400, 1100));
  }
  if (!photos.length) throw new api.VintedError('Vinted needs at least one photo.', 0);
  return photos;
}

const draftUrl = (id: number) => `${api.SITE}/items/${id}/edit`;

function needsUser(message: string, draftId: number, learned: Record<string, unknown>): VintedOutcome {
  return { status: 'needs_user', message, url: draftUrl(draftId), draft_id: String(draftId), learned };
}

/** Publish a new listing, or with `replace`, publish it and remove the old one first. */
async function publish(work: ListingWork, replace: string | null): Promise<VintedOutcome> {
  if (!(await api.loggedIn())) return { status: 'failed', message: 'Log in to Vinted in this browser first.' };
  const sessionId = uuid();
  const { ids, learned, missing } = await resolveIds(work);
  await step();
  const photos = await uploadPhotos(work, sessionId);
  const draft = buildDraft(work, ids, sessionId, photos);
  await step();
  const draftId = await api.createDraft(draft, sessionId);

  if (!ids.catalog_id) {
    return needsUser('pileGo could not match a Vinted category. The draft is saved on Vinted: pick a category there and publish.', draftId, learned);
  }

  // The draft is the safety net: it exists before the original goes.
  if (replace) {
    await step();
    const current = await api.editableItem(replace);
    if (current) {
      await api.deleteItem(replace);
      await step();
    }
  }

  try {
    const done = await api.completeDraft(draftId, forCompletion(draft, draftId), sessionId);
    return { status: 'listed', external_id: String(done.id), url: done.url ?? `${api.SITE}/items/${done.id}`, learned };
  } catch (err) {
    if (err instanceof api.VintedError && !err.blocked && err.status >= 400 && err.status < 500) {
      const fields = err.fields.length ? err.fields : missing;
      const what = fields.length ? `Vinted wants ${fields.join(', ')} filled in.` : err.message;
      return needsUser(`${what} The draft is saved on Vinted: finish it there and publish.${replace ? ' The old listing was removed.' : ''}`, draftId, learned);
    }
    throw err;
  }
}

async function changePrice(externalId: string, price: number): Promise<VintedOutcome> {
  const item = await api.editableItem(externalId);
  if (!item) return { status: 'failed', message: 'That listing is no longer on Vinted.' };
  const { photos, ...rest } = item as unknown as Record<string, unknown> & { photos?: Array<{ id: number; orientation?: number }> };
  try {
    await api.updateItem(externalId, {
      ...rest,
      price,
      photos: (photos ?? []).map(p => ({ id: p.id, orientation: p.orientation ?? 0 })),
    });
    return { status: 'done', data: { price } };
  } catch (err) {
    if (err instanceof api.VintedError && !err.blocked) {
      return { status: 'needs_user', message: `Vinted would not take the new price (${err.message}). Change it on Vinted.`, url: `${api.SITE}/items/${externalId}/edit` };
    }
    throw err;
  }
}

async function wardrobe(maxPages = 25): Promise<VintedOutcome> {
  const member = await api.memberId();
  if (!member) return { status: 'failed', message: 'Log in to Vinted in this browser first.' };
  const items: WardrobeItem[] = [];
  let complete = false;
  for (let page = 1; page <= maxPages; page += 1) {
    const { items: batch, total_pages } = await api.wardrobePage(member, page);
    items.push(...batch);
    if (!batch.length || (total_pages != null && page >= total_pages)) {
      complete = true;
      break;
    }
    await sleep(between(300, 800));
  }
  return { status: 'done', data: { items, complete, member, site: api.SITE } };
}

async function handle(msg: VintedRequest): Promise<VintedOutcome> {
  try {
    switch (msg.type) {
      case 'vinted:ping':
        return { status: 'done', data: { site: api.SITE, logged_in: await api.loggedIn() } };
      case 'vinted:publish':
        return await publish(msg.work, null);
      case 'vinted:relist':
        return await publish(msg.work, msg.work.external_id);
      case 'vinted:delist': {
        const result = await api.deleteItem(msg.external_id);
        return { status: 'done', data: { result } };
      }
      case 'vinted:price':
        return await changePrice(msg.external_id, msg.price);
      case 'vinted:wardrobe':
        return await wardrobe(msg.max_pages);
      case 'vinted:item': {
        const item = await api.editableItem(msg.external_id);
        if (item) catalogTree ??= await api.catalogs();
        return { status: 'done', data: { item, catalogs: catalogTree } };
      }
    }
  } catch (err) {
    const blocked = err instanceof api.VintedError && err.blocked;
    const transient = err instanceof api.VintedError ? err.status === 0 || err.status >= 500 : true;
    return { status: 'failed', message: errorText(err), blocked, retry_in: blocked ? undefined : transient ? 300 : undefined };
  }
}

ext.runtime.onMessage.addListener((msg: VintedRequest, _sender, reply) => {
  if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('vinted:')) return false;
  handle(msg).then(reply);
  return true;
});

void api.loggedIn().then(logged_in => ext.runtime.sendMessage({ type: 'vinted:hello', site: api.SITE, logged_in })).catch(() => {});
