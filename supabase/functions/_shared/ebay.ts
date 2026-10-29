// eBay REST client: OAuth, the seller's tokens, and typed errors.
// Docs: https://developer.ebay.com/develop/guides/sell/authorization

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import { env, HttpError } from './http.ts';

export const USER_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
  'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
];

export interface EbaySite {
  marketplace_id: string;
  currency: string;
  language: string;
  country: string;
  site_id: number;
  item_url: string;
}

export const EBAY_SITES: Record<string, EbaySite> = {
  US: { marketplace_id: 'EBAY_US', currency: 'USD', language: 'en-US', country: 'US', site_id: 0, item_url: 'https://www.ebay.com/itm/' },
  UK: { marketplace_id: 'EBAY_GB', currency: 'GBP', language: 'en-GB', country: 'GB', site_id: 3, item_url: 'https://www.ebay.co.uk/itm/' },
  EU: { marketplace_id: 'EBAY_DE', currency: 'EUR', language: 'de-DE', country: 'DE', site_id: 77, item_url: 'https://www.ebay.de/itm/' },
  AU: { marketplace_id: 'EBAY_AU', currency: 'AUD', language: 'en-AU', country: 'AU', site_id: 15, item_url: 'https://www.ebay.com.au/itm/' },
  CA: { marketplace_id: 'EBAY_CA', currency: 'CAD', language: 'en-CA', country: 'CA', site_id: 2, item_url: 'https://www.ebay.ca/itm/' },
};

export function siteFor(region: string | null | undefined): EbaySite {
  return EBAY_SITES[region ?? 'US'] ?? EBAY_SITES.US!;
}

function sandbox(): boolean {
  return (Deno.env.get('EBAY_ENV') ?? 'production').toLowerCase() === 'sandbox';
}

export function apiBase(): string {
  return sandbox() ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
}

function authBase(): string {
  return sandbox() ? 'https://auth.sandbox.ebay.com' : 'https://auth.ebay.com';
}

export function ebayConfigured(): boolean {
  return Boolean(Deno.env.get('EBAY_CLIENT_ID') && Deno.env.get('EBAY_CLIENT_SECRET') && Deno.env.get('EBAY_RU_NAME'));
}

function basicAuth(): string {
  return 'Basic ' + btoa(`${env('EBAY_CLIENT_ID')}:${env('EBAY_CLIENT_SECRET')}`);
}

// ---------------------------------------------------------------------------
// Signed OAuth state, so the callback knows which pileGo user to attach.
// ---------------------------------------------------------------------------

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env('EBAY_CLIENT_SECRET')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function signState(payload: { uid: string; return_to: string }): Promise<string> {
  const body = btoa(JSON.stringify({ ...payload, exp: Date.now() + 15 * 60_000 }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${body}.${await hmac(body)}`;
}

export async function verifyState(state: string): Promise<{ uid: string; return_to: string }> {
  const [body, sig] = state.split('.');
  if (!body || !sig || (await hmac(body)) !== sig) throw new HttpError(400, 'The eBay sign-in link is invalid. Start again from pileGo.');
  const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))) as { uid: string; return_to: string; exp: number };
  if (payload.exp < Date.now()) throw new HttpError(400, 'The eBay sign-in link expired. Start again from pileGo.');
  return payload;
}

export function consentUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env('EBAY_CLIENT_ID'),
    response_type: 'code',
    redirect_uri: env('EBAY_RU_NAME'),
    scope: USER_SCOPES.join(' '),
    state,
  });
  return `${authBase()}/oauth2/authorize?${params}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  token_type: string;
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(`${apiBase()}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basicAuth() },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new EbayError(res.status, data, 'eBay refused the sign-in. Connect eBay again from Settings.');
  }
  return data as TokenResponse;
}

export function exchangeCode(code: string): Promise<TokenResponse> {
  return tokenRequest(new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: env('EBAY_RU_NAME') }));
}

let appToken: { value: string; expires: number } | null = null;

/** Application token for public data (Browse, Taxonomy). */
export async function getAppToken(): Promise<string> {
  if (appToken && appToken.expires > Date.now() + 60_000) return appToken.value;
  const data = await tokenRequest(
    new URLSearchParams({ grant_type: 'client_credentials', scope: 'https://api.ebay.com/oauth/api_scope' }),
  );
  appToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return appToken.value;
}

export async function saveTokens(admin: SupabaseClient, userId: string, t: TokenResponse): Promise<void> {
  const now = Date.now();
  const row: Record<string, unknown> = {
    user_id: userId,
    marketplace: 'ebay',
    access_token: t.access_token,
    access_expires_at: new Date(now + t.expires_in * 1000).toISOString(),
    scopes: USER_SCOPES,
    updated_at: new Date().toISOString(),
  };
  if (t.refresh_token) {
    row.refresh_token = t.refresh_token;
    row.refresh_expires_at = t.refresh_token_expires_in
      ? new Date(now + t.refresh_token_expires_in * 1000).toISOString()
      : null;
  }
  const { error } = await admin.from('marketplace_secrets').upsert(row);
  if (error) throw new Error(`Could not save eBay tokens: ${error.message}`);
}

/** A valid user access token, refreshed when it is about to expire. */
export async function getUserToken(admin: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await admin
    .from('marketplace_secrets')
    .select('access_token, refresh_token, access_expires_at')
    .eq('user_id', userId)
    .eq('marketplace', 'ebay')
    .maybeSingle();
  if (error) throw error;
  if (!data?.refresh_token) throw new EbayNotConnected();
  if (data.access_token && data.access_expires_at && Date.parse(data.access_expires_at) > Date.now() + 120_000) {
    return data.access_token;
  }
  try {
    const fresh = await tokenRequest(
      new URLSearchParams({ grant_type: 'refresh_token', refresh_token: data.refresh_token, scope: USER_SCOPES.join(' ') }),
    );
    await saveTokens(admin, userId, fresh);
    return fresh.access_token;
  } catch (err) {
    await admin
      .from('marketplace_accounts')
      .update({ status: 'expired', last_error: 'eBay sign-in expired. Connect eBay again.' })
      .eq('user_id', userId)
      .eq('marketplace', 'ebay');
    throw err instanceof EbayError ? new EbayNotConnected('Your eBay sign-in expired. Connect eBay again in Settings.') : err;
  }
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface EbayErrorDetail {
  errorId?: number;
  message?: string;
  longMessage?: string;
  parameters?: Array<{ name: string; value: string }>;
}

export class EbayError extends Error {
  errors: EbayErrorDetail[];
  constructor(
    public status: number,
    public body: unknown,
    fallback = 'eBay refused the request.',
  ) {
    const errors = ((body as { errors?: EbayErrorDetail[] })?.errors ?? []) as EbayErrorDetail[];
    super(errors.map(e => e.longMessage || e.message).filter(Boolean).join(' ') || fallback);
    this.errors = errors;
  }
  has(id: number): boolean {
    return this.errors.some(e => e.errorId === id);
  }
}

export class EbayNotConnected extends Error {
  constructor(message = 'Connect your eBay account in Settings first.') {
    super(message);
  }
}

export interface EbayRequest {
  method?: string;
  path: string;
  token: string;
  body?: unknown;
  site?: EbaySite;
  query?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
}

export async function ebay<T = unknown>(req: EbayRequest): Promise<T> {
  const url = new URL(apiBase() + req.path);
  for (const [k, v] of Object.entries(req.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
  const headers: Record<string, string> = {
    Authorization: `Bearer ${req.token}`,
    Accept: 'application/json',
    ...req.headers,
  };
  if (req.site) {
    headers['X-EBAY-C-MARKETPLACE-ID'] = req.site.marketplace_id;
    headers['Accept-Language'] = req.site.language;
  }
  if (req.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    if (req.site) headers['Content-Language'] = req.site.language;
  }

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: req.method ?? 'GET',
      headers,
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const data = text ? safeJson(text) : undefined;
    if (!res.ok) throw new EbayError(res.status, data);
    return data as T;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 2000) };
  }
}

/** Trading API (XML) call, used only where REST has no equivalent: importing and ending legacy listings. */
export async function trading(callName: string, token: string, site: EbaySite, xmlBody: string): Promise<string> {
  const res = await fetch(`${apiBase()}/ws/api.dll`, {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': callName,
      'X-EBAY-API-SITEID': String(site.site_id),
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1355',
      'X-EBAY-API-IAF-TOKEN': token,
      'Content-Type': 'text/xml',
    },
    body: `<?xml version="1.0" encoding="utf-8"?><${callName}Request xmlns="urn:ebay:apis:eBLBaseComponents">${xmlBody}</${callName}Request>`,
  });
  const text = await res.text();
  if (!res.ok || /<Ack>Failure<\/Ack>/.test(text)) {
    const message = text.match(/<LongMessage>([\s\S]*?)<\/LongMessage>/)?.[1] ?? `eBay ${callName} failed.`;
    throw new EbayError(res.status || 400, { errors: [{ message: decodeXml(message) }] });
  }
  return text;
}

export function xmlValues(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
  for (const m of xml.matchAll(re)) out.push(decodeXml(m[1]!));
  return out;
}

export function xmlValue(xml: string, tag: string): string | null {
  return xmlValues(xml, tag)[0] ?? null;
}

export function decodeXml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
