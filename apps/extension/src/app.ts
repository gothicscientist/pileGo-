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
  if (type === 'sold-comps') {
    // Answered by request id, since several can be in flight at once.
    const requestId = (payload as { request_id?: unknown }).request_id;
    ext.runtime
      .sendMessage({ type: 'app:sold-comps', payload })
      .then((r: { comps?: unknown; error?: string; url?: string } | undefined) =>
        post('sold-comps', { request_id: requestId, comps: r?.comps ?? null, error: r?.error, url: r?.url }),
      )
      .catch(() => post('sold-comps', { request_id: requestId, comps: null, error: 'The extension was restarting. Try again.' }));
    return;
  }
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
