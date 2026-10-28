// Small HTTP helpers shared by every edge function.

const ALLOWED_ORIGINS = (Deno.env.get('PILEGO_ALLOWED_ORIGINS') ?? '*')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allow =
    ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin) || origin.startsWith('chrome-extension://') ||
      origin.startsWith('moz-extension://')
      ? origin || '*'
      : ALLOWED_ORIGINS[0] ?? '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
  }
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });
}

/** Wrap a handler with CORS preflight and uniform error responses. */
export function serve(handler: (req: Request) => Promise<Response>): void {
  Deno.serve(async req => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
    try {
      return await handler(req);
    } catch (err) {
      if (err instanceof HttpError) {
        return json(req, { error: err.message, detail: err.detail ?? null }, err.status);
      }
      console.error(err);
      return json(req, { error: 'Something went wrong on the server. Try again in a minute.' }, 500);
    }
  });
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'The request body must be JSON.');
  }
}

export function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(503, `The server is missing ${name}. Add it to the function secrets.`);
  return value;
}
