// Talking to the pileGo browser extension. The extension injects a small
// content script into this app's pages; the two sides exchange window
// messages tagged with a source so other scripts' messages are ignored.
//
// Linking: the extension keeps a session of its own. When it says it is not
// linked to the signed-in seller, the app asks the server for a one-time
// sign-in token (extension-link) and hands it over. The extension redeems it
// and from then on works with the browser closed to pileGo.

import type { PriceComp } from '@pilego/core';
import { useEffect, useState } from 'react';
import { callFunction, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';

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
  /** The pileGo user the extension is linked to. */
  user_id: string | null;
  /** The extension is waiting for the seller to approve this app in its popup. */
  needs_approval?: boolean;
  last_error?: string | null;
  /** The outcome of the last thing it was asked to do, such as an import. */
  last_message?: string | null;
}

const EMPTY: ExtensionStatus = { installed: false, version: null, tabs: {}, running: 0, linked: false, user_id: null };
let latest: ExtensionStatus = EMPTY;
let currentUser: string | null = null;
let linking = false;
const listeners = new Set<(s: ExtensionStatus) => void>();

function post(type: string, payload: Record<string, unknown> = {}) {
  window.postMessage({ source: APP, type, ...payload }, window.location.origin);
}

async function linkIfNeeded() {
  if (linking || !currentUser || !latest.installed || latest.needs_approval) return;
  if (latest.linked && latest.user_id === currentUser) return;
  linking = true;
  try {
    const { token_hash, email } = await callFunction<{ token_hash: string; email: string }>('extension-link');
    post('link', {
      token_hash,
      email,
      user_id: currentUser,
      supabase_url: SUPABASE_URL,
      anon_key: SUPABASE_ANON_KEY,
      app_url: window.location.origin,
    });
  } catch (err) {
    latest = { ...latest, last_error: err instanceof Error ? err.message : String(err) };
    for (const fn of listeners) fn(latest);
  } finally {
    // Give the extension a moment to report back before trying again.
    window.setTimeout(() => (linking = false), 8000);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data as { source?: string; type?: string; status?: Partial<ExtensionStatus> };
    if (!data || data.source !== EXT) return;
    if (data.type === 'status' || data.type === 'hello') {
      latest = { ...latest, ...data.status, installed: true };
      for (const fn of listeners) fn(latest);
      void linkIfNeeded();
    }
  });
}

/** Called by the auth provider whenever the signed-in seller changes. */
export function setExtensionUser(userId: string | null) {
  currentUser = userId;
  if (typeof window === 'undefined') return;
  post('hello');
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

/**
 * Ask the extension for comparables for `query`: recent sold prices on eBay,
 * Poshmark and Mercari and live Depop listings, read in the seller's own
 * browser, which those sites do not offer the server. Resolves null when the
 * extension is not installed, cannot answer, or takes longer than `timeoutMs`.
 */
export function fetchSoldComps(query: string, region: string, timeoutMs = 60_000): Promise<PriceComp[] | null> {
  if (typeof window === 'undefined' || !latest.installed || !query.trim()) return Promise.resolve(null);
  const request_id = crypto.randomUUID();
  return new Promise(resolve => {
    const done = (comps: PriceComp[] | null) => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
      resolve(comps);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data as { source?: string; type?: string; request_id?: string; comps?: PriceComp[] | null };
      if (!data || data.source !== EXT || data.type !== 'sold-comps' || data.request_id !== request_id) return;
      done(Array.isArray(data.comps) ? data.comps : null);
    };
    const timer = window.setTimeout(() => done(null), timeoutMs);
    window.addEventListener('message', onMessage);
    post('sold-comps', { request_id, query, region });
  });
}

export function useExtension(): ExtensionStatus {
  const [status, setStatus] = useState(latest);
  useEffect(() => {
    listeners.add(setStatus);
    post('hello');
    const poll = window.setInterval(() => post('hello'), 15_000);
    return () => {
      listeners.delete(setStatus);
      window.clearInterval(poll);
    };
  }, []);
  return status;
}
