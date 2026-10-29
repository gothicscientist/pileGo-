// Renders the PWA and extension icons from public/favicon.svg.
// Run: node scripts/icons.mjs
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const pub = fileURLToPath(new URL('../public/', import.meta.url));
const ext = fileURLToPath(new URL('../../extension/static/icons/', import.meta.url));
await mkdir(ext, { recursive: true });
const svg = await readFile(`${pub}favicon.svg`, 'utf8');
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();
// Maskable icons are cropped by the OS, so they get square corners and room.
const maskable = svg.replace('rx="14"', 'rx="0"').replace('<g transform="rotate(-14 32 32)">', '<g transform="translate(6.4 6.4) scale(.8) rotate(-14 32 32)">');
for (const [size, file, source] of [
  [192, 'icon-192.png', svg],
  [512, 'icon-512.png', svg],
  [512, 'icon-maskable-512.png', maskable],
  [180, 'apple-touch-icon.png', maskable],
  ...[16, 32, 48, 128].map(n => [n, `${ext}${n}.png`, svg]),
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;">${source.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`,
  );
  await page.screenshot({ path: file.startsWith('/') ? file : `${pub}${file}`, omitBackground: true });
}
await browser.close();
console.log('icons written');

