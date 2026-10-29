// Taking scan photos with a phone while the scan runs on a computer.
//
// The computer opens a phone_sessions row and shows a QR code for
// /phone/<id>. The phone, signed in or not, sends photos to the phone-capture
// edge function with that id; each one lands in the item's folder with a
// phone_photos row, which the computer picks up (live, with a slow poll as a
// backstop) and drops into the scan. Closing the scan closes the code.

import type { PhotoRole } from '@pilego/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { newId } from './photos';
import { fetchPhotoBlob, type StagedPhoto } from './queries';
import { ApiError, errorMessage, SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from './supabase';

export type PhoneRole = PhotoRole | 'auto';

/** Where the phone opens the capture page. VITE_PUBLIC_APP_URL wins over this tab's address. */
export function phoneUrl(sessionId: string, origin = window.location.origin): string {
  const base = ((import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) || origin).replace(/\/+$/, '');
  return `${base}/phone/${sessionId}`;
}

/** A phone cannot reach this computer's own loopback address. */
export function unreachableFromPhone(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || /^127\./.test(host) || host === '0.0.0.0';
  } catch {
    return true;
  }
}

/** True on a computer with a mouse or trackpad; phones and tablets already have a camera to hand. */
export function onComputer(): boolean {
  try {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// The computer's side
// ---------------------------------------------------------------------------

interface PhonePhotoRow {
  id: string;
  item_id: string;
  path: string;
  role: PhoneRole;
  width: number | null;
  height: number | null;
}

export interface PhonePhoto {
  file: File;
  staged: StagedPhoto;
  role: PhoneRole;
}

export interface PhoneSession {
  id: string;
  url: string;
  expiresAt: number;
  opened: boolean;
}

const POLL_MS = 4000;

/**
 * A phone link for the scan of `itemId`. Nothing happens until `open()`; after
 * that every photo the phone sends for the current item reaches `onPhoto`.
 */
export function usePhoneCapture(itemId: string, onPhoto: (photo: PhonePhoto) => void) {
  const [session, setSession] = useState<PhoneSession | null>(null);
  const [state, setState] = useState<'idle' | 'opening' | 'open' | 'expired' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [received, setReceived] = useState(0);
  const seen = useRef(new Set<string>());
  const itemRef = useRef(itemId);
  itemRef.current = itemId;
  const onPhotoRef = useRef(onPhoto);
  onPhotoRef.current = onPhoto;
  const sessionId = session?.id;

  const open = useCallback(async () => {
    setState('opening');
    setError(null);
    const id = newId();
    const { data, error } = await supabase
      .from('phone_sessions')
      .insert({ id, item_id: itemRef.current })
      .select('expires_at')
      .single();
    if (error || !data) {
      setState('error');
      setError(errorMessage(error));
      return;
    }
    seen.current.clear();
    setReceived(0);
    setSession({ id, url: phoneUrl(id), expiresAt: Date.parse(data.expires_at as string), opened: false });
    setState('open');
  }, []);

  // A saved item hands the phone over to the next one.
  useEffect(() => {
    if (!sessionId) return;
    void supabase.from('phone_sessions').update({ item_id: itemId }).eq('id', sessionId).then(() => undefined);
  }, [sessionId, itemId]);

  // Close the code when the scan goes away.
  useEffect(() => {
    if (!sessionId) return;
    return () => {
      void supabase.from('phone_sessions').delete().eq('id', sessionId).then(() => undefined);
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    let stopped = false;

    const take = async (row: PhonePhotoRow) => {
      if (seen.current.has(row.id) || row.item_id !== itemRef.current) return;
      seen.current.add(row.id);
      try {
        const blob = await fetchPhotoBlob(row.path);
        if (stopped || row.item_id !== itemRef.current) return;
        const file = new File([blob], row.path.split('/').pop() ?? 'phone.jpg', { type: blob.type || 'image/jpeg' });
        const size = row.width && row.height ? { width: row.width, height: row.height } : await measure(blob);
        onPhotoRef.current({
          file,
          role: row.role,
          staged: { id: row.id, path: row.path, cutout_path: null, ...size, preview: URL.createObjectURL(blob) },
        });
        setReceived(n => n + 1);
      } catch {
        // Try again on the next poll.
        seen.current.delete(row.id);
      }
    };

    const poll = async () => {
      const [photos, sess] = await Promise.all([
        supabase
          .from('phone_photos')
          .select('id, item_id, path, role, width, height')
          .eq('session_id', sessionId)
          .eq('item_id', itemRef.current)
          .order('created_at'),
        supabase.from('phone_sessions').select('opened_at, expires_at').eq('id', sessionId).maybeSingle(),
      ]);
      if (stopped) return;
      for (const row of (photos.data ?? []) as PhonePhotoRow[]) await take(row);
      const s = sess.data as { opened_at: string | null; expires_at: string } | null;
      if (s?.opened_at) setSession(x => (x && !x.opened ? { ...x, opened: true } : x));
      if (s && Date.parse(s.expires_at) < Date.now()) setState('expired');
    };

    const channel = supabase
      .channel(`phone-${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'phone_photos', filter: `session_id=eq.${sessionId}` }, p => {
        setSession(x => (x && !x.opened ? { ...x, opened: true } : x));
        void take(p.new as PhonePhotoRow);
      })
      .subscribe();
    void poll();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void poll().catch(() => undefined);
    }, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return { session, state, error, received, open };
}

async function measure(blob: Blob): Promise<{ width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return { width: 0, height: 0 };
  }
}

// ---------------------------------------------------------------------------
// The phone's side: no session, only the code
// ---------------------------------------------------------------------------

const ENDPOINT = `${SUPABASE_URL}/functions/v1/phone-capture`;

async function answer<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) throw new ApiError((data as { error?: string })?.error ?? `The server answered ${res.status}.`, res.status);
  return data as T;
}

export interface CaptureStatus {
  item_id: string;
  expires_at: string;
  count: number;
}

export async function captureStatus(session: string): Promise<CaptureStatus> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ session }),
  });
  return answer<CaptureStatus>(res);
}

export async function sendCapture(
  session: string,
  role: PhoneRole,
  photo: { blob: Blob; width: number; height: number },
): Promise<{ id: string; role: PhoneRole }> {
  const form = new FormData();
  form.set('session', session);
  form.set('role', role);
  form.set('width', String(photo.width));
  form.set('height', String(photo.height));
  form.set('photo', photo.blob, 'photo.jpg');
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { apikey: SUPABASE_ANON_KEY }, body: form });
  return answer(res);
}
