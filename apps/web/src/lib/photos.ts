import { supabase } from './supabase';

const MAX_EDGE = 1600;
const SIGNED_TTL = 60 * 60;

/** Shrink a phone photo to a sensible JPEG before upload. Keeps orientation. */
export async function prepareImage(file: Blob, maxEdge = MAX_EDGE, type = 'image/jpeg', quality = 0.86): Promise<{
  blob: Blob;
  width: number;
  height: number;
}> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  if (type === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not read that image.'))), type, quality),
  );
  return { blob, width, height };
}

export async function uploadPhoto(path: string, blob: Blob): Promise<void> {
  const { error } = await supabase.storage.from('photos').upload(path, blob, {
    contentType: blob.type || 'image/jpeg',
    upsert: true,
    cacheControl: '31536000',
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
}

const urlCache = new Map<string, { url: string; expires: number }>();

/** Signed URLs for private photos, cached until shortly before they expire. */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now();
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const p of paths) {
    const hit = urlCache.get(p);
    if (hit && hit.expires > now + 60_000) out[p] = hit.url;
    else missing.push(p);
  }
  if (missing.length) {
    const { data, error } = await supabase.storage.from('photos').createSignedUrls(missing, SIGNED_TTL);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) {
        out[row.path] = row.signedUrl;
        urlCache.set(row.path, { url: row.signedUrl, expires: now + SIGNED_TTL * 1000 });
      }
    }
  }
  return out;
}

export async function removePhotos(paths: string[]): Promise<void> {
  if (!paths.length) return;
  await supabase.storage.from('photos').remove(paths);
}

let removerPromise: Promise<typeof import('@imgly/background-removal')> | null = null;

/**
 * Cut the garment out of its background in the browser. The model downloads
 * once (about 40 MB) and is cached by the browser after that.
 */
export async function cutOut(image: Blob, onProgress?: (fraction: number) => void): Promise<Blob> {
  removerPromise ??= import('@imgly/background-removal');
  const { removeBackground } = await removerPromise;
  const small = await prepareImage(image, 900, 'image/png');
  const result = await removeBackground(small.blob, {
    model: 'isnet_quint8',
    output: { format: 'image/webp', quality: 0.9 },
    progress: (_key, current, total) => {
      if (total > 0) onProgress?.(current / total);
    },
  });
  return trimTransparent(result);
}

/** Crop away empty transparent margins so cutouts sit tight on the pile. */
async function trimTransparent(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let top = height,
    left = width,
    right = 0,
    bottom = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (data[(y * width + x) * 4 + 3]! > 24) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  bitmap.close();
  if (right <= left || bottom <= top) return blob;
  const pad = 6;
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  right = Math.min(width, right + pad);
  bottom = Math.min(height, bottom + pad);
  const out = document.createElement('canvas');
  out.width = right - left;
  out.height = bottom - top;
  out.getContext('2d')!.drawImage(canvas, left, top, out.width, out.height, 0, 0, out.width, out.height);
  return new Promise<Blob>((resolve, reject) =>
    out.toBlob(b => (b ? resolve(b) : reject(new Error('Could not save the cutout.'))), 'image/webp', 0.9),
  );
}

export function newId(): string {
  return crypto.randomUUID();
}
