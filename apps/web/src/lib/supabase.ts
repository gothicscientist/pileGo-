import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL || 'http://localhost:54321',
  SUPABASE_ANON_KEY || 'missing-key',
  {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  },
);

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

/** Call an edge function and turn its error body into a readable message. */
export async function callFunction<T>(name: string, body?: unknown): Promise<T> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    const message = (data as { error?: string })?.error ?? `The server answered ${res.status}.`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

/** Postgres errors from PostgREST read like stack traces; keep the human part. */
export function errorMessage(err: unknown): string {
  if (!err) return 'Something went wrong.';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  const e = err as { message?: string; details?: string };
  return e.message ?? e.details ?? 'Something went wrong.';
}
