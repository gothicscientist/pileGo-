// The toolbar popup: link approval, what the extension is doing, run now.

import depop from './assets/markets/depop.png';
import grailed from './assets/markets/grailed.png';
import mercari from './assets/markets/mercari.png';
import poshmark from './assets/markets/poshmark.png';
import vinted from './assets/markets/vinted.png';
import { ext } from './shared/browser.ts';
import type { ExtStatus } from './shared/messages.ts';
import type { PendingLink } from './bg/session.ts';

interface View {
  status: ExtStatus;
  pending: PendingLink | null;
  email: string | null;
  app_url: string | null;
  error?: string;
}

const main = document.getElementById('main')!;
const MARKETS: Record<string, { name: string; icon: string }> = {
  vinted: { name: 'Vinted', icon: vinted },
  depop: { name: 'Depop', icon: depop },
  poshmark: { name: 'Poshmark', icon: poshmark },
  mercari: { name: 'Mercari', icon: mercari },
  grailed: { name: 'Grailed', icon: grailed },
};

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: Array<Node | string | null>) {
  const el = Object.assign(document.createElement(tag), props);
  for (const k of kids) if (k != null) el.append(k);
  return el;
}

async function send(type: string): Promise<View> {
  return (await ext.runtime.sendMessage({ type })) as View;
}

function button(label: string, type: string, cls = '') {
  const b = h('button', { textContent: label, className: cls });
  b.addEventListener('click', async () => {
    b.disabled = true;
    const old = b.textContent;
    b.textContent = 'Working…';
    render(await send(type));
    b.textContent = old;
    b.disabled = false;
  });
  return b;
}

function render(v: View) {
  main.replaceChildren();
  if (v.error) main.append(h('p', { className: 'err', textContent: v.error }));

  if (v.pending) {
    main.append(
      h('h1', { textContent: 'Link this browser?' }),
      h('p', {}, 'A pileGo app at ', h('code', { textContent: v.pending.origin }), ` wants to link this browser to ${v.pending.email}.`),
      h('p', { className: 'muted', textContent: 'Only allow it if you just opened your own pileGo there. The extension will act on your marketplace tabs for that account.' }),
      h('div', { className: 'row' }, button('Allow', 'popup:approve', 'go'), button('No', 'popup:deny')),
    );
    return;
  }

  const s = v.status;
  if (!s.linked) {
    main.append(
      h('h1', { textContent: 'Not linked yet' }),
      h('p', { textContent: 'Open pileGo and sign in. This browser links by itself and stays signed in.' }),
    );
    if (v.app_url) main.append(h('a', { className: 'btn', href: v.app_url, target: '_blank', textContent: 'Open pileGo' }));
    if (s.last_error) main.append(h('p', { className: 'err', textContent: s.last_error }));
    return;
  }

  const parts: Array<Node | null> = [
    h('h1', {}, h('span', { className: s.running ? 'live busy' : 'live' }), s.running ? `Working on ${s.running} ${s.running === 1 ? 'listing' : 'listings'}` : 'Ready to list'),
    h('p', { className: 'muted', textContent: `Linked to ${v.email ?? 'your pileGo account'}.` }),
    h(
      'ul',
      { className: 'tabs', ariaLabel: 'Marketplace tabs open' },
      ...Object.entries(MARKETS).map(([id, m]) =>
        h('li', { className: s.tabs[id] ? 'on' : '', title: s.tabs[id] ? `${m.name} is open` : `${m.name} is not open` }, h('img', { src: m.icon, alt: '' }), m.name),
      ),
    ),
    s.last_message ? h('p', { className: 'note', textContent: s.last_message }) : null,
    s.last_error ? h('p', { className: 'err', textContent: s.last_error }) : null,
    h('p', { className: 'muted', textContent: 'Waiting listings go up by themselves within two minutes. Run now starts them straight away, and each marketplace tab shows its progress in the corner.' }),
    h('div', { className: 'row' }, button('Run now', 'popup:run', 'go'), button('Check for sales', 'popup:sync')),
    h(
      'div',
      { className: 'row' },
      v.app_url ? h('a', { className: 'btn', href: v.app_url, target: '_blank', textContent: 'Open pileGo' }) : null,
      button('Unlink', 'popup:unlink', 'quiet'),
    ),
    h('p', { className: 'muted', textContent: `Extension ${s.version}` }),
  ];
  main.append(...parts.filter((p): p is Node => p != null));
}

send('popup:status').then(render, err => {
  main.replaceChildren(h('p', { className: 'err', textContent: String(err) }));
});
