// Vinted's own web endpoints, called from a logged-in Vinted tab. This is the
// same API Vinted's upload form uses; there is no public seller API.
//
// Adapted from Bumpline's content.js (GPL-3.0-or-later, by g1ampy): the
// main-world bridge, the CSRF and anon-id lookups, the write headers, and the
// draft-then-complete publish flow.

import { errorText, ext, uuid } from '../shared/browser.ts';
import { noteRefusal, refusalKind, retryAfterMs } from '../shared/pace.ts';
import { userFromMarkup, type CatalogNode, type EditableItem, type SizeGroup, type WardrobeItem } from './map.ts';

export const SITE = location.origin;

/** A refusal from Vinted, with what the caller needs to decide what next. */
export class VintedError extends Error {
  status: number;
  fields: string[];
  blocked: boolean;
  constructor(message: string, status: number, fields: string[] = [], blocked = false) {
    super(message);
    this.status = status;
    this.fields = fields;
    this.blocked = blocked;
  }
}

interface Reply {
  ok: boolean;
  status: number;
  header: (name: string) => string | null;
  text: string;
}

// ---------------------------------------------------------------------------
// Main-world bridge
// ---------------------------------------------------------------------------

const CH = uuid().replace(/-/g, '').slice(0, 16);
let bridgeAlive = false;
let settle: () => void = () => {};
const bridgeReady = new Promise<void>(resolve => {
  const want = `pg:${CH}:ok`;
  const done = (event: MessageEvent) => {
    if (event.source !== window || event.data?.t !== want) return;
    bridgeAlive = true;
    settle();
  };
  const timer = setTimeout(() => settle(), 4000);
  settle = () => {
    clearTimeout(timer);
    window.removeEventListener('message', done);
    resolve();
  };
  window.addEventListener('message', done);
});

try {
  const script = document.createElement('script');
  script.src = ext.runtime.getURL('bridge.js');
  script.dataset.ch = CH;
  script.onerror = () => settle();
  (document.head || document.documentElement).appendChild(script);
} catch {
  settle();
}

interface Field {
  name: string;
  value?: string;
  blob?: Blob;
  filename?: string;
}

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  fields?: Field[];
  /** How long to wait for Vinted's answer. A photo upload from a slow connection takes a while. */
  timeout?: number;
}

async function direct(url: string, o: RequestOptions): Promise<Reply> {
  let body: BodyInit | undefined = o.body;
  if (o.fields) {
    const form = new FormData();
    for (const f of o.fields) {
      if (f.blob) form.append(f.name, f.blob, f.filename ?? 'file');
      else form.append(f.name, f.value ?? '');
    }
    body = form;
  }
  const r = await fetch(url, { method: o.method ?? 'GET', credentials: 'include', headers: o.headers, body });
  return { ok: r.ok, status: r.status, header: n => r.headers.get(n), text: await r.text() };
}

// A write that has gone quiet may still be in flight; sending it again would
// open a second draft or publish a duplicate. Only reads fall back.
const REPEATABLE = /^(GET|HEAD)$/i;

async function request(url: string, o: RequestOptions = {}): Promise<Reply> {
  await bridgeReady;
  if (!bridgeAlive) return direct(url, o);
  const id = uuid();
  const msg: Record<string, unknown> = { t: `pg:${CH}:q`, id, url, method: o.method, headers: o.headers };
  const transfer: Transferable[] = [];
  if (o.fields) {
    const fields = [];
    for (const f of o.fields) {
      if (f.blob) {
        const buffer = await f.blob.arrayBuffer();
        fields.push({ name: f.name, buffer, filename: f.filename, type: f.blob.type });
        transfer.push(buffer);
      } else fields.push({ name: f.name, value: f.value });
    }
    msg.fields = fields;
  } else if (o.body !== undefined) msg.body = o.body;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', onReply);
      if (REPEATABLE.test(o.method ?? 'GET')) direct(url, o).then(resolve, reject);
      else reject(new VintedError('Vinted did not answer in time. Check your Vinted tab before trying again.', 0));
    }, o.timeout ?? (REPEATABLE.test(o.method ?? 'GET') ? 15_000 : 45_000));
    function onReply(event: MessageEvent) {
      const d = event.data;
      if (event.source !== window || !d || d.t !== `pg:${CH}:r` || d.id !== id) return;
      clearTimeout(timer);
      window.removeEventListener('message', onReply);
      if (d.e) reject(new Error(d.e));
      else {
        const h = (d.h ?? {}) as Record<string, string>;
        resolve({ ok: d.s >= 200 && d.s < 300, status: d.s, header: n => h[n.toLowerCase()] ?? null, text: d.b ?? '' });
      }
    }
    window.addEventListener('message', onReply);
    window.postMessage(msg, location.origin, transfer);
  });
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

const TOKEN = /\\?"CSRF_TOKEN\\?"\s*:\s*\\?"([^"\\]+)\\?"/;

export function tokenFromMarkup(markup: string): string | null {
  return markup.match(TOKEN)?.[1] ?? null;
}

export function readCookie(name: string): string | null {
  let found: string | null = null;
  for (const chunk of (document.cookie || '').split(';')) {
    const at = chunk.indexOf('=');
    if (at < 1) continue;
    if (decodeURIComponent(chunk.slice(0, at).trim()) === name) found = decodeURIComponent(chunk.slice(at + 1));
  }
  return found;
}

async function workerTokens(): Promise<{ csrf?: string | null; anon?: string | null }> {
  try {
    return ((await ext.runtime.sendMessage({ type: 'vinted:tokens' })) as { csrf?: string; anon?: string }) ?? {};
  } catch {
    return {};
  }
}

let csrfCache: string | null = null;

export async function csrfToken(): Promise<string> {
  if (csrfCache) return csrfCache;
  const inPage = tokenFromMarkup(document.documentElement?.innerHTML ?? '');
  if (inPage) return (csrfCache = inPage);
  const seen = await workerTokens();
  if (seen.csrf) return (csrfCache = seen.csrf);
  const page = await request(`${SITE}/items/new`);
  const fetched = tokenFromMarkup(page.text);
  if (!fetched) throw new VintedError('Could not read Vinted’s security token. Log in to Vinted in this tab and try again.', page.status);
  return (csrfCache = fetched);
}

async function anonId(): Promise<string | null> {
  return readCookie('anon_id') ?? (await workerTokens()).anon ?? null;
}

let currentUser: string | null | undefined;

/**
 * The logged-in member's id. The v_uid cookie used to say, but Vinted now
 * marks it HttpOnly on some domains (vinted.com), so the page cannot read it.
 * The page's own markup says next; the current-user endpoint last. That
 * endpoint answers 403 both when logged out and when the bot shield has not
 * warmed up in a fresh background tab, so a refusal alone never means
 * "logged out" while the markup says otherwise.
 */
export async function memberId(): Promise<string | null> {
  const fromCookie = readCookie('v_uid');
  if (fromCookie && /^\d+$/.test(fromCookie)) return fromCookie;
  if (currentUser) return currentUser;
  const drawn = userFromMarkup(document.documentElement?.innerHTML ?? '');
  if (drawn) return (currentUser = drawn);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const reply = await request(`${SITE}/api/v2/users/current`, { headers: { accept: 'application/json, text/plain, */*' } });
      const id = reply.ok ? (JSON.parse(reply.text || '{}') as { user?: { id?: number } }).user?.id : null;
      if (id) return (currentUser = String(id));
      // A clear "not logged in" from both the page and the API.
      if (drawn === null && (reply.status === 401 || reply.status === 403 || reply.ok)) return null;
    } catch {
      // Network trouble: try again.
    }
    if (attempt < 3) await new Promise(done => setTimeout(done, 1500 * attempt));
  }
  // A logged-out answer is not cached: the seller may log in in this tab.
  return null;
}

async function writeHeaders(): Promise<Record<string, string>> {
  const anon = await anonId();
  return {
    accept: 'application/json, text/plain, */*',
    'content-type': 'application/json',
    'x-csrf-token': await csrfToken(),
    'x-enable-multiple-size-groups': 'true',
    'X-Enable-Dynamic-Attribute-Condition': 'true',
    'X-Enable-Dynamic-Attribute-Video-Game-Rating': 'true',
    'X-Enable-Dynamic-Attribute-Size': 'true',
    ...(anon ? { 'x-anon-id': anon } : {}),
  };
}

async function readHeaders(): Promise<Record<string, string>> {
  const anon = await anonId();
  let csrf: string | null = null;
  try {
    csrf = await csrfToken();
  } catch {
    // Reads work without it.
  }
  return {
    accept: 'application/json, text/plain, */*',
    'x-enable-multiple-size-groups': 'true',
    ...(csrf ? { 'x-csrf-token': csrf } : {}),
    ...(anon ? { 'x-anon-id': anon } : {}),
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

function explain(status: number, body: string): string {
  if (status === 401) return 'You are logged out of Vinted. Log in and try again.';
  if (refusalKind(status, body) === 403) return 'Vinted showed a bot check. Open Vinted, finish it, and try again later.';
  if (status === 429) return 'Vinted asked for a break. pileGo will try again later.';
  try {
    const parsed = JSON.parse(body) as { errors?: Array<{ field?: string; value?: string }>; message?: string };
    if (parsed.errors?.length) return parsed.errors.map(e => (e.field ? `${e.field}: ${e.value}` : e.value)).join('; ');
    if (parsed.message) return parsed.message;
  } catch {
    // Not JSON.
  }
  return `Vinted answered ${status}.`;
}

function refusedFields(body: string): string[] {
  try {
    const parsed = JSON.parse(body) as { errors?: Array<{ field?: string }> };
    return (parsed.errors ?? []).map(e => e.field).filter((f): f is string => Boolean(f));
  } catch {
    return [];
  }
}

async function fail(reply: Reply): Promise<never> {
  const kind = refusalKind(reply.status, reply.text);
  if (kind) await noteRefusal('vinted', kind, retryAfterMs(reply.header('retry-after')));
  throw new VintedError(explain(reply.status, reply.text), reply.status, refusedFields(reply.text), Boolean(kind));
}

function parse<T>(reply: Reply): T {
  try {
    return JSON.parse(reply.text || '{}') as T;
  } catch {
    throw new VintedError('Vinted sent back something pileGo could not read.', reply.status);
  }
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

async function get<T>(path: string): Promise<T> {
  const reply = await request(`${SITE}${path}`, { headers: await readHeaders() });
  if (!reply.ok) await fail(reply);
  return parse<T>(reply);
}

/** The first of several paths that answers; Vinted has moved some of these before. */
async function getFirst<T>(paths: string[], pick: (body: Record<string, unknown>) => T | null): Promise<T | null> {
  for (const path of paths) {
    try {
      const reply = await request(`${SITE}${path}`, { headers: await readHeaders() });
      if (!reply.ok) {
        if (refusalKind(reply.status, reply.text)) await fail(reply);
        continue;
      }
      const value = pick(parse<Record<string, unknown>>(reply));
      if (value) return value;
    } catch (err) {
      if (err instanceof VintedError && err.blocked) throw err;
    }
  }
  return null;
}

export function catalogs(): Promise<CatalogNode[] | null> {
  return getFirst(['/api/v2/item_upload/catalogs', '/api/v2/catalogs'], b =>
    Array.isArray(b.catalogs) && b.catalogs.length ? (b.catalogs as CatalogNode[]) : null,
  );
}

export async function sizeGroups(catalogId: number): Promise<SizeGroup[]> {
  // vinted.com answers the first path only; the older one is kept for other domains.
  return (
    (await getFirst(
      [`/api/v2/size_groups?catalog_ids=${catalogId}`, `/api/v2/item_upload/size_groups?catalog_ids[]=${catalogId}`],
      b => (Array.isArray(b.size_groups) ? (b.size_groups as SizeGroup[]) : null),
    )) ?? []
  );
}

export function colours(): Promise<Array<{ id: number; title: string }> | null> {
  return getFirst(['/api/v2/item_upload/colors', '/api/v2/colors'], b =>
    Array.isArray(b.colors) && b.colors.length ? (b.colors as Array<{ id: number; title: string }>) : null,
  );
}

export async function brands(keyword: string): Promise<Array<{ id: number; title: string }>> {
  const q = encodeURIComponent(keyword);
  return (
    (await getFirst([`/api/v2/item_upload/brands?keyword=${q}`, `/api/v2/brands?keyword=${q}`], b =>
      Array.isArray(b.brands) ? (b.brands as Array<{ id: number; title: string }>) : null,
    )) ?? []
  );
}

export async function uploadPhoto(blob: Blob, sessionId: string): Promise<{ id: number; orientation?: number }> {
  const anon = await anonId();
  const reply = await request(`${SITE}/api/v2/photos`, {
    method: 'POST',
    headers: {
      'x-csrf-token': await csrfToken(),
      'x-enable-multiple-size-groups': 'true',
      ...(anon ? { 'x-anon-id': anon } : {}),
    },
    fields: [
      { name: 'photo[type]', value: 'item' },
      { name: 'photo[temp_uuid]', value: sessionId },
      { name: 'photo[file]', blob, filename: 'photo.jpg' },
    ],
    timeout: 120_000,
  });
  if (!reply.ok) await fail(reply);
  const body = parse<{ id?: number; orientation?: number; photo?: { id: number; orientation?: number } }>(reply);
  const photo = body.photo ?? body;
  if (!photo.id) throw new VintedError('Vinted did not accept a photo.', reply.status);
  return { id: photo.id, orientation: photo.orientation };
}

export async function createDraft(draft: unknown, sessionId: string): Promise<number> {
  const reply = await request(`${SITE}/api/v2/item_upload/drafts`, {
    method: 'POST',
    headers: await writeHeaders(),
    body: JSON.stringify({ draft, parcel: null, upload_session_id: sessionId }),
  });
  if (!reply.ok) await fail(reply);
  const body = parse<{ draft?: { id?: number }; item?: { id?: number }; id?: number }>(reply);
  const id = body.draft?.id ?? body.item?.id ?? body.id;
  if (!id) throw new VintedError('Vinted saved the draft without an id.', reply.status);
  return id;
}

/** Completion validates the body it is sent, not the stored draft, so the full draft goes again. */
export async function completeDraft(draftId: number, draft: unknown, sessionId: string): Promise<{ id: number; url?: string; price?: number }> {
  const reply = await request(`${SITE}/api/v2/item_upload/drafts/${draftId}/completion`, {
    method: 'POST',
    headers: await writeHeaders(),
    body: JSON.stringify({ draft, push_up: false, parcel: null, upload_session_id: sessionId }),
  });
  if (!reply.ok) await fail(reply);
  const body = parse<{ item?: { id?: number; url?: string; path?: string }; draft?: { id?: number }; id?: number }>(reply);
  const item = body.item ?? body.draft ?? body;
  const id = (item as { id?: number }).id ?? draftId;
  const url = (item as { url?: string }).url ?? `${SITE}/items/${id}`;
  return { id, url: url.startsWith('http') ? url : `${SITE}${url}` };
}

export async function discardDraft(draftId: number): Promise<void> {
  try {
    await request(`${SITE}/api/v2/item_upload/drafts/${draftId}`, { method: 'DELETE', headers: await writeHeaders() });
  } catch (err) {
    console.debug('[pileGo] could not discard draft', draftId, errorText(err));
  }
}

/** Removes a live listing. A listing that is already gone counts as removed. */
export async function deleteItem(itemId: string | number): Promise<'deleted' | 'gone'> {
  const anon = await anonId();
  const reply = await request(`${SITE}/api/v2/items/${itemId}/delete`, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/plain, */*',
      'x-csrf-token': await csrfToken(),
      ...(anon ? { 'x-anon-id': anon } : {}),
    },
  });
  if (reply.status === 404) return 'gone';
  if (!reply.ok) await fail(reply);
  return 'deleted';
}

export async function editableItem(itemId: string | number): Promise<EditableItem | null> {
  const reply = await request(`${SITE}/api/v2/item_upload/items/${itemId}`, { headers: await readHeaders() });
  if (reply.status === 404) return null;
  if (!reply.ok) await fail(reply);
  const body = parse<{ item?: EditableItem }>(reply);
  return body.item ?? (body as EditableItem);
}

/** Changes the price of a live listing through the edit endpoint the upload form uses. */
export async function updateItem(itemId: string | number, item: Record<string, unknown>): Promise<void> {
  const reply = await request(`${SITE}/api/v2/item_upload/items/${itemId}`, {
    method: 'PUT',
    headers: await writeHeaders(),
    body: JSON.stringify({ item: { ...item, id: Number(itemId) }, feedback_id: null, parcel: null, upload_session_id: uuid() }),
  });
  if (!reply.ok) await fail(reply);
}

export async function wardrobePage(member: string, page: number): Promise<{ items: WardrobeItem[]; total_pages: number | null }> {
  const query = new URLSearchParams({ page: String(page), per_page: '20', order: 'relevance' });
  const body = await get<{ items?: WardrobeItem[]; pagination?: { total_pages?: number } }>(
    `/api/v2/wardrobe/${member}/items?${query}`,
  );
  return { items: body.items ?? [], total_pages: body.pagination?.total_pages ?? null };
}

/**
 * Whether this tab is logged in to Vinted. "out" only when the page itself was
 * drawn logged out and the API agrees; anything else is not proof, so pileGo
 * carries on and lets Vinted's own answer to the listing decide.
 */
export async function loginState(): Promise<'in' | 'out' | 'unknown'> {
  if (await memberId()) return 'in';
  return userFromMarkup(document.documentElement?.innerHTML ?? '') === null ? 'out' : 'unknown';
}

export async function loggedIn(): Promise<boolean> {
  return (await loginState()) !== 'out';
}
