// Read a garment's photos and draft its listing fields.
//
// POST { photos: string[] (storage paths under the caller's folder), currency?, hint? }
// → ScanResult

import { visionJson, type VisionImage } from '../_shared/ai.ts';
import { normalizeScan, SCAN_JSON_SCHEMA, SCAN_SYSTEM_PROMPT, scanUserPrompt } from '../_shared/core/scan.ts';
import { HttpError, json, readJson, serve } from '../_shared/http.ts';
import { adminClient, requireUser } from '../_shared/supabase.ts';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';

const MAX_PHOTOS = 12;
const MAX_BYTES = 6 * 1024 * 1024;

serve(async req => {
  if (req.method !== 'POST') throw new HttpError(405, 'Use POST.');
  const { user } = await requireUser(req);
  const body = await readJson<{ photos?: string[]; currency?: string; hint?: string }>(req);

  const paths = (body.photos ?? []).filter(p => typeof p === 'string').slice(0, MAX_PHOTOS);
  if (!paths.length) throw new HttpError(400, 'Add at least one photo to scan.');
  for (const path of paths) {
    if (!path.startsWith(`${user.id}/`) || path.includes('..')) {
      throw new HttpError(403, 'You can only scan your own photos.');
    }
  }
  const currency = /^[A-Z]{3}$/.test(body.currency ?? '') ? body.currency! : 'USD';

  const admin = adminClient();
  const images: VisionImage[] = [];
  let total = 0;
  for (const path of paths) {
    const { data, error } = await admin.storage.from('photos').download(path);
    if (error || !data) throw new HttpError(404, 'A photo could not be found. Upload it again.');
    const bytes = new Uint8Array(await data.arrayBuffer());
    total += bytes.byteLength;
    if (total > MAX_BYTES * 3) break;
    images.push({ mime: data.type || 'image/jpeg', base64: encodeBase64(bytes) });
  }

  const raw = await visionJson({
    system: SCAN_SYSTEM_PROMPT,
    prompt: scanUserPrompt(currency, body.hint),
    images,
    schema: SCAN_JSON_SCHEMA as unknown as Record<string, unknown>,
  });

  return json(req, normalizeScan(raw, currency));
});
