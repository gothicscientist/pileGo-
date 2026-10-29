// Keeping a human pace on marketplaces that have no seller API. None of this
// disguises the extension: it asks less of the site, spreads the work out,
// and stops for a while when the site says no. The numbers follow Bumpline's
// (GPL-3.0-or-later, by g1ampy), which were tuned against real Vinted
// accounts.

import { ext } from './browser.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Writes that create or replace a listing, per marketplace. */
export const WRITE_CAPS = { per_hour: 8, per_day: 40 };

/** Base pause after the site refuses: rate limit, or a bot check. */
const BLOCK_BASE = { 429: 15 * 60_000, 403: 30 * 60_000 } as const;
const BLOCK_CAP = 6 * HOUR;

export const CHALLENGE = /captcha-delivery|__cf_chl|cf_chl|datadome/i;

export type RefusalKind = 429 | 403 | 0;

/** 401 is left out on purpose: logging in fixes it. So is a plain 403, which also means "not your item". */
export function refusalKind(status: number, body: string): RefusalKind {
  if (status === 429) return 429;
  if (status === 403 && CHALLENGE.test(body)) return 403;
  return 0;
}

/** Retry-After as seconds or as an HTTP date. */
export function retryAfterMs(raw: string | null | undefined, now = Date.now()): number {
  if (!raw) return 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - now) : 0;
}

/** Each refusal in the same day doubles the pause, four doublings at most, six hours at the very most. */
export function blockFor(kind: Exclude<RefusalKind, 0>, strikesToday: number, retryAfter = 0): number {
  const escalated = BLOCK_BASE[kind] * 2 ** Math.min(strikesToday, 4);
  return Math.min(Math.max(retryAfter, escalated), BLOCK_CAP);
}

/** How long until another write fits under the caps, or 0 when one fits now. */
export function waitForCap(writes: number[], now = Date.now(), caps = WRITE_CAPS): number {
  const lastHour = writes.filter(t => now - t < HOUR).sort((a, b) => a - b);
  const lastDay = writes.filter(t => now - t < DAY).sort((a, b) => a - b);
  let wait = 0;
  if (lastHour.length >= caps.per_hour) wait = Math.max(wait, lastHour[lastHour.length - caps.per_hour]! + HOUR - now);
  if (lastDay.length >= caps.per_day) wait = Math.max(wait, lastDay[lastDay.length - caps.per_day]! + DAY - now);
  return Math.max(0, wait);
}

export interface Block {
  until: number;
  why: 'rate_limit' | 'bot_check';
}

const key = (market: string, what: string) => `pace.${market}.${what}`;

export async function readBlock(market: string): Promise<Block | null> {
  const bag = await ext.storage.local.get(key(market, 'block'));
  const block = bag[key(market, 'block')] as Block | undefined;
  return block && block.until > Date.now() ? block : null;
}

export async function noteRefusal(market: string, kind: Exclude<RefusalKind, 0>, retryAfter = 0): Promise<Block> {
  const k = key(market, 'strikes');
  const bag = await ext.storage.local.get(k);
  const strikes = ((bag[k] as number[] | undefined) ?? []).filter(t => Date.now() - t < DAY);
  const block: Block = {
    until: Date.now() + blockFor(kind, strikes.length, retryAfter),
    why: kind === 429 ? 'rate_limit' : 'bot_check',
  };
  await ext.storage.local.set({ [k]: [...strikes, Date.now()], [key(market, 'block')]: block });
  return block;
}

export async function capWait(market: string): Promise<number> {
  const k = key(market, 'writes');
  const bag = await ext.storage.local.get(k);
  return waitForCap((bag[k] as number[] | undefined) ?? []);
}

export async function noteWrite(market: string): Promise<void> {
  const k = key(market, 'writes');
  const bag = await ext.storage.local.get(k);
  const writes = ((bag[k] as number[] | undefined) ?? []).filter(t => Date.now() - t < DAY);
  await ext.storage.local.set({ [k]: [...writes, Date.now()] });
}

export function blockMessage(market: string, block: Block): string {
  const mins = Math.max(1, Math.round((block.until - Date.now()) / 60_000));
  const when = mins >= 90 ? `${Math.round(mins / 60)} hours` : `${mins} minutes`;
  return block.why === 'rate_limit'
    ? `${market} asked for a break. pileGo will try again in about ${when}.`
    : `${market} showed a bot check. Open ${market} in a tab and finish it; pileGo waits ${when} before trying again.`;
}
