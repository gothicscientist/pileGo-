// Photos from a phone for a scan running on a computer.
//
// The phone is not signed in. It holds a phone_sessions id from the QR code
// the computer showed, and that id is the only thing it can use:
//
// POST JSON { session }                  → { item_id, expires_at, count }
//   Checks the code still works and marks the phone as connected.
// POST multipart session, role, width, height, photo
//                                        → { id, role }
//   Files the photo under the owner's folder for the item being scanned. The
//   computer sees the new phone_photos row and adds the photo to the scan.

import { HttpError, json, serve } from '../_shared/http.ts';
import { adminClient } from '../_shared/supabase.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = new Set(['front', 'back', 'label', 'extra', 'auto']);
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 10 * 1024 * 1024;
// The scan holds twelve; a few more covers retakes.
const MAX_PER_ITEM = 16;

interface Session {
  id: string;
  user_id: string;
  item_id: string;
  opened_at: string | null;
  expires_at: string;
}

async function openSession(id: unknown): Promise<Session> {
  if (typeof id !== 'string' || !UUID.test(id)) throw new HttpError(400, 'That code is not a pileGo code.');
  const { data, error } = await adminClient()
    .from('phone_sessions')
    .select('id, user_id, item_id, opened_at, expires_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'This code was closed on your computer. Make a new one from the scan page.');
  if (Date.parse(data.expires_at) < Date.now()) {
    throw new HttpError(410, 'This code expired. Make a new one from the scan page on your computer.');
  }
  return data as Session;
}

async function photoCount(session: Session): Promise<number> {
  const { count, error } = await adminClient()
    .from('phone_photos')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session.id)
    .eq('item_id', session.item_id);
  if (error) throw error;
  return count ?? 0;
}

function size(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n < 20000 ? Math.round(n) : null;
}

serve(async req => {
  if (req.method !== 'POST') throw new HttpError(405, 'Use POST.');
  const type = req.headers.get('content-type') ?? '';

  if (!type.startsWith('multipart/form-data')) {
    let body: { session?: unknown };
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, 'The request body must be JSON.');
    }
    const session = await openSession(body.session);
    if (!session.opened_at) {
      await adminClient().from('phone_sessions').update({ opened_at: new Date().toISOString() }).eq('id', session.id);
    }
    return json(req, { item_id: session.item_id, expires_at: session.expires_at, count: await photoCount(session) });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, 'The photo did not arrive in one piece. Try again.');
  }
  const session = await openSession(form.get('session'));
  const photo = form.get('photo');
  if (!(photo instanceof File) || !photo.size) throw new HttpError(400, 'No photo came with that request.');
  const ext = TYPES[photo.type];
  if (!ext) throw new HttpError(415, 'Send the photo as a JPEG, PNG or WebP.');
  if (photo.size > MAX_BYTES) throw new HttpError(413, 'That photo is over 10 MB.');
  const role = String(form.get('role') ?? 'auto');
  if (!ROLES.has(role)) throw new HttpError(400, 'Unknown photo slot.');
  if ((await photoCount(session)) >= MAX_PER_ITEM) {
    throw new HttpError(409, 'That is plenty of photos for one item. Save it on your computer to start the next.');
  }

  const db = adminClient();
  const id = crypto.randomUUID();
  const path = `${session.user_id}/${session.item_id}/${id}.${ext}`;
  const { error: upload } = await db.storage.from('photos').upload(path, photo, {
    contentType: photo.type,
    cacheControl: '31536000',
  });
  if (upload) throw new HttpError(502, `Could not store the photo: ${upload.message}`);

  const { error } = await db.from('phone_photos').insert({
    id,
    session_id: session.id,
    user_id: session.user_id,
    item_id: session.item_id,
    path,
    role,
    width: size(form.get('width')),
    height: size(form.get('height')),
  });
  if (error) {
    await db.storage.from('photos').remove([path]);
    throw error;
  }
  return json(req, { id, role });
});
