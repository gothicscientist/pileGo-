// Talking to the pileGo browser extension. The extension injects a small
// content script into this app's pages; the two sides exchange window
// messages tagged with a source so other scripts' messages are ignored.

import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';

const APP = 'pilego-app';
const EXT = 'pilego-ext';

export interface ExtensionStatus {
  installed: boolean;
  version: string | null;
  /** Marketplaces with an open, logged-in tab right now. */
  tabs: Record<string, boolean>;
  /** Jobs the extension is running or waiting on. */
  running: number;
  linked: boolean;
}

const EMPTY: ExtensionStatus = { installed: false, version: null, tabs: {}, running: 0, linked: false };
let latest: ExtensionStatus = EMPTY;
const listeners = new Set<(s: ExtensionStatus) => void>();

function post(type: string, payload: Record<string, unknown> = {}) {
  window.postMessage({ source: APP, type, ...payload }, window.location.origin);
}

if (typeof window !== 'undefined') {
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data as { source?: string; type?: string; status?: Partial<ExtensionStatus> };
    if (!data || data.source !== EXT) return;
    if (data.type === 'status' || data.type === 'hello') {
      latest = { ...latest, ...data.status, installed: true };
      for (const fn of listeners) fn(latest);
    }
  });
}

let lastSession: Session | null = null;

export function shareSessionWithExtension(session: Session | null) {
  lastSession = session;
  if (typeof window === 'undefined') return;
  post('session', {
    session: session
      ? {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          user_id: session.user.id,
          email: session.user.email,
        }
      : null,
    supabase_url: SUPABASE_URL,
    anon_key: SUPABASE_ANON_KEY,
    app_url: window.location.origin,
  });
}

/** Ask the extension to look for new jobs now rather than on its next timer. */
export function pokeExtension() {
  post('run-jobs');
}

export function askExtensionToSync(marketplaces?: string[]) {
  post('sync', { marketplaces: marketplaces ?? null });
}

export function askExtensionToImport(marketplace: string) {
  post('import', { marketplace });
}

export function useExtension(): ExtensionStatus {
  const [status, setStatus] = useState(latest);
  useEffect(() => {
    listeners.add(setStatus);
    post('hello');
    // Re-share the session once the content script is listening.
    const timer = window.setTimeout(() => {
      if (lastSession) shareSessionWithExtension(lastSession);
    }, 400);
    const poll = window.setInterval(() => post('hello'), 15_000);
    return () => {
      listeners.delete(setStatus);
      window.clearTimeout(timer);
      window.clearInterval(poll);
    };
  }, []);
  return status;
}
