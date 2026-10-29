// Builds the pileGo extension for Chrome (MV3 service worker) and Firefox
// (MV3 event page) from one source tree.
//
//   node build.mjs           dist/chrome and dist/firefox
//   node build.mjs                  dist/chrome and dist/firefox
//   node build.mjs --zip            also pilego-extension-chrome.zip and -firefox.zip
//   node build.mjs --zip-to=<dir>   zips written to <dir> instead of dist (the web
//                                   app's build uses this to serve them at /downloads)
//   node build.mjs --watch          rebuild Chrome on change
//
// The extension trusts https://pilego.app (and localhost for development)
// without asking. PILEGO_APP_ORIGINS (comma separated) adds the origins of a
// self-hosted copy, for example https://pilego.pages.dev. Other *.pages.dev
// origins can still link, after the seller approves them in the popup.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { zipSync } from 'fflate';

const root = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const args = new Set(process.argv.slice(2));
const zipTo = process.argv.find(a => a.startsWith('--zip-to='))?.slice('--zip-to='.length);

const DEFAULT_ORIGINS = ['https://pilego.app', 'https://www.pilego.app', 'http://localhost:5173', 'http://127.0.0.1:5173'];
const trusted = (process.env.PILEGO_APP_ORIGINS ?? '')
  .split(',')
  .map(s => s.trim().replace(/\/+$/, ''))
  .filter(Boolean);
const appOrigins = [...new Set([...DEFAULT_ORIGINS, ...trusted])];

export const VINTED_DOMAINS = [
  'vinted.at', 'vinted.be', 'vinted.co.uk', 'vinted.com', 'vinted.cz', 'vinted.de', 'vinted.dk',
  'vinted.es', 'vinted.fi', 'vinted.fr', 'vinted.gr', 'vinted.hr', 'vinted.hu', 'vinted.ie',
  'vinted.it', 'vinted.lt', 'vinted.lu', 'vinted.nl', 'vinted.pl', 'vinted.pt', 'vinted.ro',
  'vinted.se', 'vinted.sk',
];
const vintedMatches = VINTED_DOMAINS.map(d => `https://www.${d}/*`);

// Sites where the extension fills the sell form for the seller.
const assistMatches = [
  'https://www.depop.com/*',
  'https://poshmark.com/*',
  'https://poshmark.ca/*',
  'https://www.mercari.com/*',
  'https://www.grailed.com/*',
  'https://www.facebook.com/*',
];

const appMatches = [...appOrigins.map(o => `${o}/*`), 'https://*.pages.dev/*'];

// eBay's public sold-listings search, read for price comparisons.
export const EBAY_SEARCH_DOMAINS = ['www.ebay.com', 'www.ebay.co.uk', 'www.ebay.de', 'www.ebay.com.au', 'www.ebay.ca'];
const ebayMatches = EBAY_SEARCH_DOMAINS.map(d => `https://${d}/*`);

function manifest(browser) {
  const m = {
    manifest_version: 3,
    name: 'pileGo',
    short_name: 'pileGo',
    version: pkg.version,
    description: 'Cross-list your secondhand clothes from pileGo to Vinted, Depop, Poshmark, Mercari, Grailed and Facebook.',
    icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
    action: { default_title: 'pileGo', default_popup: 'popup.html', default_icon: { 16: 'icons/16.png', 32: 'icons/32.png' } },
    permissions: ['storage', 'alarms', 'webRequest'],
    host_permissions: [...vintedMatches, ...assistMatches, 'https://*.vinted.net/*', 'https://*.supabase.co/*', ...ebayMatches, ...appMatches],
    content_scripts: [
      { matches: appMatches, js: ['app.js'], run_at: 'document_start' },
      { matches: vintedMatches, js: ['vinted.js'], run_at: 'document_idle' },
      { matches: assistMatches, js: ['assist.js'], run_at: 'document_idle' },
    ],
    web_accessible_resources: [{ resources: ['bridge.js'], matches: vintedMatches }],
  };
  if (browser === 'chrome') {
    m.background = { service_worker: 'background.js' };
    m.minimum_chrome_version = '116';
  } else {
    m.background = { scripts: ['background.js'] };
    m.browser_specific_settings = { gecko: { id: 'extension@pilego.app', strict_min_version: '128.0' } };
  }
  return m;
}

const entries = {
  background: 'src/background.ts',
  app: 'src/app.ts',
  vinted: 'src/vinted/content.ts',
  assist: 'src/assist/content.ts',
  popup: 'src/popup.ts',
};

async function build(browser) {
  const out = join(root, 'dist', browser);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  await esbuild.build({
    absWorkingDir: root,
    entryPoints: entries,
    outdir: out,
    bundle: true,
    format: 'iife',
    target: browser === 'chrome' ? 'chrome116' : 'firefox128',
    minify: false,
    sourcemap: false,
    legalComments: 'inline',
    define: {
      __APP_ORIGINS__: JSON.stringify(appOrigins),
      __VERSION__: JSON.stringify(pkg.version),
    },
    logLevel: 'warning',
  });
  cpSync(join(root, 'static'), out, { recursive: true });
  writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest(browser), null, 2)}\n`);
  return out;
}

function filesIn(dir, base = dir, out = {}) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) filesIn(path, base, out);
    else out[relative(base, path).split('\\').join('/')] = readFileSync(path);
  }
  return out;
}

/** Zip with plain JavaScript, so building needs no `zip` binary on the host. */
function zip(dir, name) {
  const outDir = zipTo ? resolve(process.cwd(), zipTo) : join(root, 'dist');
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, name);
  // A fixed date keeps the zip identical between builds of the same source.
  writeFileSync(file, zipSync(filesIn(dir), { level: 9, mtime: new Date('2026-01-01T00:00:00Z') }));
  return file;
}

if (args.has('--watch')) {
  const ctx = await esbuild.context({
    absWorkingDir: root,
    entryPoints: entries,
    outdir: join(root, 'dist', 'chrome'),
    bundle: true,
    format: 'iife',
    target: 'chrome116',
    define: { __APP_ORIGINS__: JSON.stringify(appOrigins), __VERSION__: JSON.stringify(pkg.version) },
  });
  await build('chrome');
  await ctx.watch();
  console.log('Watching. Load dist/chrome as an unpacked extension.');
} else {
  for (const browser of ['chrome', 'firefox']) {
    const out = await build(browser);
    if (!existsSync(join(out, 'icons', '128.png'))) throw new Error('static/icons is missing; run pnpm icons first.');
    if (args.has('--zip') || zipTo) console.log('Wrote', zip(out, `pilego-extension-${browser}.zip`));
    else console.log('Built', out);
  }
  console.log('Trusted app origins:', appOrigins.join(', '));
}
