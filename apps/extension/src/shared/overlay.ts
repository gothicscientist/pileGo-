// The pileGo! card in the bottom-right corner of every marketplace tab. It
// stays up for the whole listing, steps and all, and can be shrunk to a pill
// but not closed while pileGo is working. Shadow DOM, so the site's styles
// and ours leave each other alone.

import { MARKETPLACES, type MarketplaceId } from '@pilego/core';
import depop from '../assets/markets/depop.png';
import grailed from '../assets/markets/grailed.png';
import mercari from '../assets/markets/mercari.png';
import poshmark from '../assets/markets/poshmark.png';
import vinted from '../assets/markets/vinted.png';
import { alive, ext } from './browser.ts';

const ICONS: Partial<Record<MarketplaceId, string>> = { depop, grailed, mercari, poshmark, vinted };
const DOT: Partial<Record<MarketplaceId, string>> = { depop: '#ff2300', grailed: '#111111', mercari: '#5356ee', poshmark: '#7f0353', vinted: '#007782' };

export type CardState = 'working' | 'done' | 'needs' | 'stopped';

export interface CardAction {
  label: string;
  onClick: () => void;
}

export interface CardOptions {
  marketplace: MarketplaceId;
  /** The item, shown on a kraft tag. */
  item?: string;
  state: CardState;
  heading: string;
  /** The current step while working; what happened or what to do otherwise. */
  message: string;
  link?: string | null;
  rows?: Array<{ label: string; value: string; done?: boolean }>;
  primary?: CardAction;
  secondary?: CardAction;
}

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.wrap {
  --paper: #f4f0e6; --paper-2: #e8e2d2; --card: #fffdf6; --ink: #22241e; --ink-2: #4b4e44; --muted: #77786c;
  --line: #dcd4c0; --accent: #56703f; --accent-deep: #3e5430; --accent-ink: #fbf8ee; --tomato: #e0533a;
  --kraft: #d9c49c; --kraft-ink: #3a3125; --danger: #c23b2b; --butter: #f2cd5c; --shadow: 40 36 24;
  position: fixed; z-index: 2147483646; right: 16px; bottom: 16px;
  font: 14px/1.42 'pileGo Franklin', 'Libre Franklin', 'Franklin Gothic Medium', system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: var(--ink); -webkit-font-smoothing: antialiased; letter-spacing: -0.005em;
}
@media (prefers-color-scheme: dark) {
  .wrap {
    --paper: #161813; --paper-2: #1f221b; --card: #262a21; --ink: #f2efe4; --ink-2: #cbc8b9; --muted: #97978a;
    --line: #363b2f; --accent: #a8c68a; --accent-deep: #c4dcaa; --accent-ink: #141810; --tomato: #ff7b5e;
    --kraft: #c8b083; --kraft-ink: #2a2318; --danger: #ff8a78; --butter: #f4d671; --shadow: 0 0 0;
  }
}
.card {
  width: min(340px, calc(100vw - 32px)); max-height: min(72vh, 580px); display: flex; flex-direction: column;
  background: var(--card); border-radius: 20px; overflow: hidden;
  box-shadow: 0 0 0 1px var(--line), 0 2px 4px rgb(var(--shadow) / .08), 0 28px 56px -22px rgb(var(--shadow) / .5);
  animation: rise .34s cubic-bezier(.22,1,.36,1);
}
@keyframes rise { from { opacity: 0; transform: translateY(14px) rotate(.6deg); } }
.head { display: flex; align-items: center; gap: 8px; padding: 12px 12px 10px 14px; background: var(--paper); border-bottom: 1px dashed var(--line); }
.mark { display: inline-flex; align-items: center; gap: 5px; }
.mark svg { width: 22px; height: 22px; transform: rotate(-10deg); }
.word { font-weight: 900; font-style: italic; font-size: 19px; letter-spacing: -.055em; line-height: 1; }
.word i { color: var(--tomato); font-style: italic; display: inline-block; }
.chip { display: inline-flex; align-items: center; gap: 6px; margin-left: 4px; padding: 3px 9px 3px 3px; border-radius: 999px;
  background: var(--card); box-shadow: inset 0 0 0 1px var(--line); font-size: 12px; font-weight: 650; color: var(--ink-2); }
.chip img, .chip .dot { width: 18px; height: 18px; border-radius: 50%; display: block; flex: none; }
.chip .dot { color: #fff; font-size: 10px; font-weight: 800; text-align: center; line-height: 18px; }
.icon { margin-left: auto; display: inline-flex; gap: 2px; }
.icon button { width: 30px; height: 30px; border: 0; border-radius: 999px; background: transparent; color: var(--ink-2); cursor: pointer;
  font: inherit; font-size: 18px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; }
.icon button:hover { background: var(--paper-2); color: var(--ink); }
.body { padding: 14px 16px 12px; overflow: auto; display: flex; flex-direction: column; gap: 10px; }
.tag { align-self: flex-start; position: relative; max-width: 100%; padding: 4px 12px 4px 22px; background: var(--kraft); color: var(--kraft-ink);
  font-size: 12px; font-weight: 650; border-radius: 0 7px 7px 0; clip-path: polygon(10px 0, 100% 0, 100% 100%, 10px 100%, 0 50%);
  transform: rotate(-1.5deg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  background-image: radial-gradient(rgb(255 255 255 / .18) .7px, transparent .8px), radial-gradient(rgb(80 60 30 / .12) .6px, transparent .7px);
  background-size: 5px 5px, 7px 7px; background-position: 0 0, 2px 3px; }
.tag::before { content: ''; position: absolute; left: 10px; top: 50%; width: 6px; height: 6px; margin-top: -3px; border-radius: 50%;
  background: var(--card); box-shadow: inset 0 1px 1.5px rgb(0 0 0 / .35); }
h2 { margin: 0; font-size: 18px; line-height: 1.2; font-weight: 800; letter-spacing: -.025em; }
.done h2 { color: var(--accent); }
.needs h2 { color: var(--danger); }
.bar { height: 6px; border-radius: 999px; background: var(--paper-2); overflow: hidden; }
.bar span { display: block; height: 100%; border-radius: inherit; background: var(--accent); transition: width .5s cubic-bezier(.22,1,.36,1);
  background-image: repeating-linear-gradient(-45deg, transparent 0 6px, rgb(255 255 255 / .22) 6px 12px); background-size: 34px 100%;
  animation: slide 1s linear infinite; }
.done .bar span { animation: none; }
@keyframes slide { to { background-position: 34px 0; } }
ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
ol li { display: flex; align-items: flex-start; gap: 8px; color: var(--muted); font-size: 13px; }
ol li .s { flex: none; width: 16px; height: 16px; margin-top: 1px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; }
ol li.past .s { background: var(--accent); color: var(--accent-ink); font-size: 10px; font-weight: 900; }
ol li.now { color: var(--ink); font-weight: 650; }
ol li.now .s { border: 2px solid var(--line); border-top-color: var(--accent); animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.msg { margin: 0; color: var(--ink-2); }
a.view { align-self: flex-start; color: var(--accent); font-weight: 700; text-decoration: none; border-bottom: 2px solid currentColor; padding-bottom: 1px; }
a.view:hover { color: var(--accent-deep); }
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
ul li { display: flex; align-items: center; gap: 8px; padding: 7px 8px 7px 10px; background: var(--paper); border-radius: 10px; }
ul li span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
ul li small { display: block; color: var(--muted); font-size: 11px; }
ul li.ok { opacity: .62; }
button.copy { flex: none; border: 0; background: var(--card); color: var(--ink); box-shadow: inset 0 0 0 1px var(--line); border-radius: 999px;
  padding: 4px 10px; font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
.foot { display: flex; align-items: center; gap: 8px; padding: 10px 14px 14px; }
.foot button { min-height: 38px; border: 0; font: inherit; font-weight: 650; font-size: 14px; cursor: pointer; transition: transform .15s; }
.foot .go { flex: 1; position: relative; isolation: isolate; color: var(--accent-ink); background: transparent; padding: 0 16px 0 28px; }
.foot .go::before { content: ''; position: absolute; inset: 0; z-index: -1; background: var(--accent); border-radius: 0 12px 12px 0;
  clip-path: polygon(14px 0, 100% 0, 100% 100%, 14px 100%, 0 50%); box-shadow: inset 0 -2px 0 rgb(0 0 0 / .12); }
.foot .go::after { content: ''; position: absolute; left: 10px; top: 50%; width: 7px; height: 7px; margin-top: -3.5px; border-radius: 50%;
  background: var(--card); box-shadow: inset 0 1px 1.5px rgb(0 0 0 / .35); }
.foot .go:hover { transform: rotate(-1.5deg) translateY(-1px); }
.foot .go:hover::before { background: var(--accent-deep); }
.foot .no { padding: 0 14px; border-radius: 999px; background: var(--paper-2); color: var(--ink); }
.foot .no:hover { background: var(--line); }
.foot .no:only-child { margin-left: auto; }
button:focus-visible, a:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.pill { display: inline-flex; align-items: center; gap: 8px; max-width: min(340px, calc(100vw - 32px)); padding: 8px 14px 8px 10px;
  border: 0; border-radius: 999px; background: var(--card); color: var(--ink); cursor: pointer; font: inherit; font-size: 13px; font-weight: 650;
  box-shadow: 0 0 0 1px var(--line), 0 18px 36px -18px rgb(var(--shadow) / .55); animation: rise .3s cubic-bezier(.22,1,.36,1); }
.pill svg { width: 20px; height: 20px; flex: none; transform: rotate(-10deg); }
.pill .word { font-size: 16px; }
.pill .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-2); }
.pill .live { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .3; } }
@media (prefers-reduced-motion: reduce) {
  .card, .pill { animation: none; }
  .bar span, ol li.now .s, .pill .live { animation: none; }
}
`;

const TAG_SVG = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2.5 C 10 2.5, 9 9, 13.5 10.5" fill="none" stroke="currentColor" stroke-opacity=".7" stroke-width="1.3" stroke-linecap="round"/><path d="M11 8 H21 L26 13 V28 a2 2 0 0 1 -2 2 H8 a2 2 0 0 1 -2 -2 V13 Z" fill="var(--kraft)"/><circle cx="16" cy="12.5" r="2" fill="var(--paper)"/><path d="M10.5 19.5 H21.5 M10.5 24 H18" stroke="var(--kraft-ink)" stroke-width="1.7" stroke-linecap="round" opacity=".55"/></svg>`;

let host: HTMLElement | null = null;
let root: ShadowRoot | null = null;
let current: CardOptions | null = null;
let steps: string[] = [];
const MIN_KEY = 'pilego.card.min';

function minimised(): boolean {
  try {
    return sessionStorage.getItem(MIN_KEY) === '1';
  } catch {
    return false;
  }
}

function setMinimised(on: boolean) {
  try {
    if (on) sessionStorage.setItem(MIN_KEY, '1');
    else sessionStorage.removeItem(MIN_KEY);
  } catch {
    // Storage blocked: it just will not be remembered on the next page.
  }
}

let fontLoaded = false;
/** The app's typeface. Loaded from bytes, so a site's font-src rules do not stop it. */
function loadFont() {
  if (fontLoaded || !alive() || typeof FontFace === 'undefined') return;
  fontLoaded = true;
  for (const [style, file] of [['normal', 'fonts/libre-franklin-latin-wght-normal.woff2'], ['italic', 'fonts/libre-franklin-latin-wght-italic.woff2']] as const) {
    fetch(ext.runtime.getURL(file))
      .then(r => r.arrayBuffer())
      .then(bytes => new FontFace('pileGo Franklin', bytes, { style, weight: '100 900' }).load())
      .then(face => document.fonts.add(face))
      .catch(() => {});
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: Array<Node | string | null | false>) {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children) if (c) node.append(c);
  return node;
}

function wordmark(): HTMLElement {
  const mark = el('span', { className: 'mark' });
  mark.innerHTML = TAG_SVG;
  mark.append(el('span', { className: 'word' }, 'pileGo', el('i', { textContent: '!' })));
  return mark;
}

function chip(market: MarketplaceId): HTMLElement {
  const name = MARKETPLACES[market]?.name ?? market;
  const c = el('span', { className: 'chip' });
  const dot = el('span', { className: 'dot', textContent: name[0] ?? '' });
  dot.style.background = DOT[market] ?? '#56703f';
  const src = ICONS[market];
  if (src) {
    const img = el('img', { src, alt: '' });
    img.addEventListener('error', () => img.replaceWith(dot));
    c.append(img);
  } else c.append(dot);
  c.append(name);
  return c;
}

/** "Posting in 3…" and "Posting in 2…" are one step, not two. */
function sameStep(a: string, b: string): boolean {
  const head = (s: string) => s.toLowerCase().replace(/\d+/g, '#').split(/\s+/).slice(0, 4).join(' ');
  return head(a) === head(b);
}

function noteStep(message: string) {
  if (!message) return;
  const last = steps[steps.length - 1];
  if (last === message) return;
  if (last && sameStep(last, message)) steps[steps.length - 1] = message;
  else steps.push(message);
}

function render() {
  if (!root || !current) return;
  const o = current;
  const wrap = el('div', { className: 'wrap' });
  if (minimised() && o.state === 'working') {
    const pill = el('button', { className: 'pill', title: 'Show pileGo' });
    pill.innerHTML = TAG_SVG;
    pill.append(el('span', { className: 'word' }, 'pileGo', el('i', { textContent: '!' })), el('span', { className: 'live' }), el('span', { className: 't', textContent: o.message }));
    pill.setAttribute('aria-label', `pileGo: ${o.message}. Show details`);
    pill.addEventListener('click', () => {
      setMinimised(false);
      render();
    });
    wrap.append(pill);
    root.replaceChildren(el('style', { textContent: CSS }), wrap);
    return;
  }

  const icons = el('span', { className: 'icon' });
  if (o.state === 'working') {
    const min = el('button', { textContent: '–', title: 'Shrink' });
    min.setAttribute('aria-label', 'Shrink the pileGo card');
    min.addEventListener('click', () => {
      setMinimised(true);
      render();
    });
    icons.append(min);
  } else {
    const x = el('button', { textContent: '×', title: 'Close' });
    x.setAttribute('aria-label', 'Close the pileGo card');
    x.addEventListener('click', closeCard);
    icons.append(x);
  }

  const body = el('div', { className: 'body' });
  if (o.item) body.append(el('span', { className: 'tag', textContent: o.item, title: o.item }));
  body.append(el('h2', { textContent: o.heading }));
  if (o.state === 'working' || o.state === 'done') {
    const bar = el('div', { className: 'bar' });
    bar.setAttribute('role', 'progressbar');
    const pct = o.state === 'done' ? 100 : Math.min(92, 8 + steps.length * 10);
    bar.setAttribute('aria-valuenow', String(pct));
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    const fill = el('span');
    fill.style.width = `${pct}%`;
    bar.append(fill);
    body.append(bar);
  }
  if (o.state === 'working') {
    const list = el('ol');
    const shown = steps.slice(-5);
    shown.forEach((s, i) => {
      const now = i === shown.length - 1;
      list.append(el('li', { className: now ? 'now' : 'past' }, el('span', { className: 's', textContent: now ? '' : '✓' }), s));
    });
    body.append(list);
  } else if (o.message) body.append(el('p', { className: 'msg', textContent: o.message }));
  if (o.link) body.append(el('a', { className: 'view', href: o.link, target: '_blank', rel: 'noopener', textContent: 'View listing ↗' }));
  if (o.rows?.length) {
    const list = el('ul');
    for (const row of o.rows) {
      const copy = el('button', { className: 'copy', textContent: 'Copy' });
      copy.addEventListener('click', async () => {
        await navigator.clipboard.writeText(row.value).catch(() => {});
        copy.textContent = 'Copied';
        setTimeout(() => (copy.textContent = 'Copy'), 1400);
      });
      list.append(el('li', { className: row.done ? 'ok' : '' }, el('span', {}, el('small', { textContent: row.done ? `${row.label}, filled in` : row.label }), row.value), copy));
    }
    body.append(list);
  }

  const foot = el('div', { className: 'foot' });
  if (o.secondary) {
    const b = el('button', { className: 'no', textContent: o.secondary.label });
    b.addEventListener('click', o.secondary.onClick);
    foot.append(b);
  }
  if (o.primary) {
    const b = el('button', { className: 'go', textContent: o.primary.label });
    b.addEventListener('click', o.primary.onClick);
    foot.append(b);
  }

  const card = el(
    'div',
    { className: `card ${o.state}` },
    el('div', { className: 'head' }, wordmark(), chip(o.marketplace), icons),
    body,
    foot.childElementCount ? foot : null,
  );
  card.setAttribute('role', o.state === 'needs' ? 'alertdialog' : 'status');
  card.setAttribute('aria-live', 'polite');
  card.setAttribute('aria-label', `pileGo: ${o.heading}`);
  wrap.append(card);
  root.replaceChildren(el('style', { textContent: CSS }), wrap);
}

/** Show or update the card. A new item, or a fresh start, clears the step list. */
export function showCard(opts: CardOptions) {
  loadFont();
  if (!current || current.marketplace !== opts.marketplace || current.item !== opts.item) steps = [];
  if (opts.state === 'working') noteStep(opts.message);
  else setMinimised(false);
  current = opts;
  if (!host || !host.isConnected) {
    host = document.createElement('pilego-panel');
    root = host.attachShadow({ mode: 'closed' });
    document.documentElement.append(host);
  }
  render();
}

/** A new step while working, keeping the rest of the card as it is. */
export function cardStep(message: string) {
  if (!current) return;
  showCard({ ...current, state: 'working', message });
}

export function resetCard() {
  steps = [];
}

export function cardShown(): boolean {
  return Boolean(host?.isConnected);
}

export function closeCard() {
  host?.remove();
  host = null;
  root = null;
  current = null;
  steps = [];
}
