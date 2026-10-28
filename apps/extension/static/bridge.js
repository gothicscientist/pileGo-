// pileGo main-world fetch bridge, adapted from Bumpline's bridge.js.
//
// Copyright (C) 2026 g1ampy (Bumpline), 2026 pileGo contributors
//
// This program is free software: you can redistribute it and/or modify it
// under the terms of the GNU Affero General Public License as published by the
// Free Software Foundation, either version 3 of the License, or (at your
// option) any later version. Bumpline is GPL-3.0-or-later, which allows this.
//
// A content script's fetch skips the patches the page applies to its own
// window.fetch (bot-protection SDKs add headers there). This bridge runs in
// the page's world so pileGo's requests to Vinted look like the page's own.
// Nothing crosses the channel that the page does not already hold.

(() => {
  'use strict';

  const script = document.currentScript;
  const ch = script && script.dataset.ch;
  if (!ch) return;

  const REQ = 'pg:' + ch + ':q';
  const RES = 'pg:' + ch + ':r';

  window.addEventListener('message', async event => {
    if (event.source !== window) return;
    const d = event.data;
    if (!d || d.t !== REQ) return;

    try {
      let body;
      const headers = d.headers ? { ...d.headers } : {};
      if (d.fields) {
        body = new FormData();
        for (const f of d.fields) {
          if (f.buffer) body.append(f.name, new Blob([f.buffer], { type: f.type || 'application/octet-stream' }), f.filename || 'file');
          else body.append(f.name, f.value);
        }
        // The boundary belongs to the FormData.
        for (const key of Object.keys(headers)) if (key.toLowerCase() === 'content-type') delete headers[key];
      } else if (d.body !== undefined) {
        body = d.body;
      }

      const response = await fetch(d.url, { method: d.method || 'GET', credentials: 'include', headers, body });
      const text = await response.text();
      const rh = {};
      response.headers.forEach((v, k) => { rh[k] = v; });
      window.postMessage({ t: RES, id: d.id, s: response.status, h: rh, b: text }, location.origin);
    } catch (err) {
      window.postMessage({ t: RES, id: d.id, e: String(err) }, location.origin);
    }
  });

  window.postMessage({ t: 'pg:' + ch + ':ok' }, location.origin);
  if (script.parentNode) script.parentNode.removeChild(script);
})();
