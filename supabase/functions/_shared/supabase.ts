import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.118.0';
import { env, HttpError } from './http.ts';

/** A client with full access. Only for server-side work; never return its data unfiltered. */
export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A client acting as the caller, so row-level security applies. */
export function userClient(req: Request): SupabaseClient {
  const authorization = req.headers.get('Authorization');
  if (!authorization) throw new HttpError(401, 'Sign in first.');
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireUser(req: Request): Promise<{ user: User; db: SupabaseClient }> {
  const db = userClient(req);
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new HttpError(401, 'Your session has expired. Sign in again.');
  return { user: data.user, db };
}

/**
 * True when the request carries a server key (cron, internal calls): the
 * service role key, or one of the project's `sb_secret_` keys. Projects made
 * with the newer API keys put a secret key in SUPABASE_SERVICE_ROLE_KEY and
 * list every secret key in SUPABASE_SECRET_KEYS, so accept any of them.
 */
export function isServiceCall(req: Request): boolean {
  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return false;
  return serverKeys().includes(authorization.slice(7));
}

function serverKeys(): string[] {
  const keys = [Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')];
  try {
    // A JSON object of key name to key, e.g. {"default":"sb_secret_..."}.
    const secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    if (secret && typeof secret === 'object') keys.push(...Object.values(secret as Record<string, string>));
  } catch {
    // Not set or not JSON: the service role key alone decides.
  }
  return keys.filter((k): k is string => typeof k === 'string' && k.length > 0);
}
