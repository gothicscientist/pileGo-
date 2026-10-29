// Runs on pileGo web app pages. Relays window messages between the app and
// the background worker; the app never talks to the worker directly.

import { ext } from './shared/browser.ts';

const APP = 'pilego-app';
const EXT = 'pilego-ext';

function post(type: string, extra: Record<string, unknown> = {}) {
  window.postMessage({ source: EXT, type, ...extra }, location.origin);
}

window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== location.origin) return;
  const data = event.data as { source?: string; type?: string } | null;
  if (!data || data.source !== APP || typeof data.type !== 'string') return;
  const { source: _source, type, ...payload } = data;
  ext.runtime
    .sendMessage({ type: `app:${type}`, payload })
    .then(status => status && post('status', { status }))
    .catch(() => {
      // The worker was restarting; the app asks again on its next hello.
    });
});

ext.runtime.onMessage.addListener((msg: { type?: string; status?: unknown }) => {
  if (msg?.type === 'app:status') post('status', { status: msg.status });
  return false;
});

ext.runtime
  .sendMessage({ type: 'app:hello', payload: {} })
  .then(status => status && post('status', { status }))
  .catch(() => {});
