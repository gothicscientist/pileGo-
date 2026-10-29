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

/** True when the request carries the service role key (cron, internal calls). */
export function isServiceCall(req: Request): boolean {
  const authorization = req.headers.get('Authorization') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return Boolean(key) && authorization === `Bearer ${key}`;
}
