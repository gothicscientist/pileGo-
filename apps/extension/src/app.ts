// Runs on pileGo web app pages. Relays window messages between the app and
// the background worker; the app never talks to the worker directly.

import { alive, ext, send } from './shared/browser.ts';

const APP = 'pilego-app';
const EXT = 'pilego-ext';

function post(type: string, extra: Record<string, unknown> = {}) {
  window.postMessage({ source: EXT, type, ...extra }, location.origin);
}

function onAppMessage(event: MessageEvent) {
  if (event.source !== window || event.origin !== location.origin) return;
  const data = event.data as { source?: string; type?: string } | null;
  if (!data || data.source !== APP || typeof data.type !== 'string') return;
  // The extension was reloaded or updated under this page. The new copy of
  // this script only arrives with a page refresh, so this one bows out.
  if (!alive()) {
    window.removeEventListener('message', onAppMessage);
    return;
  }
  const { source: _source, type, ...payload } = data;
  if (type === 'sold-comps') {
    // Answered by request id, since several can be in flight at once.
    const requestId = (payload as { request_id?: unknown }).request_id;
    void send<{ comps?: unknown; error?: string; url?: string; sources?: unknown }>({ type: 'app:sold-comps', payload }).then(r =>
      post('sold-comps', {
        request_id: requestId,
        comps: r?.comps ?? null,
        error: r ? r.error : 'The extension was restarting. Try again.',
        url: r?.url,
        sources: r?.sources ?? null,
      }),
    );
    return;
  }
  // No answer means the worker was restarting; the app asks again on its next hello.
  void send({ type: `app:${type}`, payload }).then(status => status && post('status', { status }));
}

window.addEventListener('message', onAppMessage);

ext.runtime.onMessage.addListener((msg: { type?: string; status?: unknown }) => {
  if (msg?.type === 'app:status') post('status', { status: msg.status });
  return false;
});

void send({ type: 'app:hello', payload: {} }).then(status => status && post('status', { status }));
