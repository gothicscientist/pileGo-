// The extension's own pileGo session. It never shares the web app's: Supabase
// rotates refresh tokens and treats a reused one as theft, so two clients on
// one session sign each other out. Instead the app hands over a one-time
// magic-link token, which this side redeems for a session of its own.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ext } from '../shared/browser.ts';

declare const __APP_ORIGINS__: string[];

export interface Config {
  supabase_url: string;
  anon_key: string;
  app_url: string;
  user_id: string;
  email: string;
}

export interface LinkRequest {
  token_hash: string;
  email: string;
  user_id: string;
  supabase_url: string;
  anon_key: string;
  app_url: string;
}

export interface PendingLink extends LinkRequest {
  origin: string;
  at: number;
}

const STORAGE_KEY = 'pilego.auth';

const storage = {
  getItem: async (key: string) => ((await ext.storage.local.get(key))[key] as string | undefined) ?? null,
  setItem: async (key: string, value: string) => ext.storage.local.set({ [key]: value }),
  removeItem: async (key: string) => ext.storage.local.remove(key),
};

let client: SupabaseClient | null = null;
let clientFor: string | null = null;

function makeClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      storage,
      storageKey: STORAGE_KEY,
      persistSession: true,
      // A service worker sleeps; the session is refreshed when it is read instead.
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function config(): Promise<Config | null> {
  return ((await ext.storage.local.get('config')).config as Config | undefined) ?? null;
}

export async function getClient(): Promise<SupabaseClient | null> {
  const cfg = await config();
  if (!cfg) return null;
  if (!client || clientFor !== cfg.supabase_url) {
    client = makeClient(cfg.supabase_url, cfg.anon_key);
    clientFor = cfg.supabase_url;
  }
  return client;
}

/** A client with a live session, or null when the extension is not linked. */
export async function authed(): Promise<{ sb: SupabaseClient; cfg: Config } | null> {
  const [sb, cfg] = await Promise.all([getClient(), config()]);
  if (!sb || !cfg) return null;
  const { data } = await sb.auth.getSession();
  if (!data.session) return null;
  return { sb, cfg };
}

// ---------------------------------------------------------------------------
// Which apps may link
// ---------------------------------------------------------------------------

export async function trustedOrigins(): Promise<string[]> {
  const saved = ((await ext.storage.local.get('trusted_origins')).trusted_origins as string[] | undefined) ?? [];
  return [...new Set([...__APP_ORIGINS__, ...saved])];
}

export async function isTrusted(origin: string): Promise<boolean> {
  return (await trustedOrigins()).includes(origin);
}

async function trust(origin: string) {
  const saved = ((await ext.storage.local.get('trusted_origins')).trusted_origins as string[] | undefined) ?? [];
  if (!saved.includes(origin)) await ext.storage.local.set({ trusted_origins: [...saved, origin] });
}

export async function pendingLink(): Promise<PendingLink | null> {
  const p = (await ext.storage.local.get('pending_link')).pending_link as PendingLink | undefined;
  // Link tokens last an hour.
  return p && Date.now() - p.at < 55 * 60_000 ? p : null;
}

export async function holdLink(origin: string, req: LinkRequest) {
  await ext.storage.local.set({ pending_link: { ...req, origin, at: Date.now() } satisfies PendingLink });
}

export async function dropPendingLink() {
  await ext.storage.local.remove('pending_link');
}

function validUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

/** Trade the one-time token for a session of the extension's own. */
export async function redeem(origin: string, req: LinkRequest): Promise<Config> {
  if (!validUrl(req.supabase_url) || !req.anon_key || !req.token_hash) throw new Error('The link request was incomplete.');
  const current = await getClient();
  await current?.auth.signOut({ scope: 'local' }).catch(() => {});
  await ext.storage.local.remove(STORAGE_KEY);

  const sb = makeClient(req.supabase_url, req.anon_key);
  const { data, error } = await sb.auth.verifyOtp({ token_hash: req.token_hash, type: 'magiclink' });
  if (error) throw new Error(`Could not link: ${error.message}`);
  if (!data.user || data.user.id !== req.user_id) {
    await sb.auth.signOut({ scope: 'local' }).catch(() => {});
    throw new Error('The link was for a different account.');
  }
  const cfg: Config = { supabase_url: req.supabase_url, anon_key: req.anon_key, app_url: origin, user_id: data.user.id, email: req.email };
  await ext.storage.local.set({ config: cfg });
  await trust(origin);
  await dropPendingLink();
  client = sb;
  clientFor = req.supabase_url;
  return cfg;
}

export async function unlink() {
  const sb = await getClient();
  await sb?.auth.signOut({ scope: 'local' }).catch(() => {});
  await ext.storage.local.remove(['config', STORAGE_KEY]);
  client = null;
  clientFor = null;
}
