// Vision model adapter. Gemini is the default because its free tier covers a
// seller's daily scanning; any provider that takes images and returns JSON can
// be added behind the same function.

import { HttpError } from './http.ts';

export interface VisionImage {
  mime: string;
  base64: string;
  /** A line sent just before the image, saying what it shows. */
  caption?: string;
}

export interface VisionRequest {
  system: string;
  prompt: string;
  images: VisionImage[];
  schema: Record<string, unknown>;
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
/** Edge functions are stopped at 150 s; leave room to answer. */
const TOTAL_BUDGET_MS = 120_000;
/** With no answer after this long, the next model is asked as well and the first good answer wins. */
const HEDGE_AFTER_MS = 8_000;
/** Overloaded models answer 503 at once, so trying several costs little. */
const MAX_MODELS = 5;
/** A model that timed out or was overloaded goes to the back of the line for this long. */
const BENCH_MS = 10 * 60_000;
/** Used when the key's model list cannot be read. */
const FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-flash-latest'];
let listedModels: string[] | null = null;
const benchedUntil = new Map<string, number>();

/** Gemini's schema dialect wants upper-case type names. */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === 'type' && typeof value === 'string') out.type = value.toUpperCase();
    else if (key === 'enum' && Array.isArray(value)) out.enum = [...value];
    else out[key] = toGeminiSchema(value);
  }
  return out;
}

/**
 * Stable, numbered Flash models, newest first. Aliases such as
 * gemini-flash-latest, previews and the lite, audio and image variants are
 * left out: aliases can point at a model that is overloaded or slow to answer.
 */
export function rankFlashModels(names: string[]): string[] {
  return [...new Set(names.map(n => n.replace(/^models\//, '')))]
    .filter(n => /^gemini-\d+(\.\d+)?-flash$/.test(n))
    .sort((a, b) => compareVersions(versionOf(b), versionOf(a)));
}

/** [major, minor]: 3.10 is newer than 3.8. */
function versionOf(name: string): [number, number] {
  const [major = 0, minor = 0] = (name.match(/gemini-([\d.]+)/)?.[1] ?? '0').split('.').map(Number);
  return [major, minor];
}

function compareVersions(a: [number, number], b: [number, number]): number {
  return a[0] - b[0] || a[1] - b[1];
}

/** Benched models keep their order but go after the healthy ones. */
export function withBenchedLast(models: string[], benched: (model: string) => boolean): string[] {
  return [...models.filter(m => !benched(m)), ...models.filter(m => benched(m))];
}

/** The models to try, in order: GEMINI_MODEL first when set, then the newest Flash models this key can use. */
async function candidateModels(key: string): Promise<string[]> {
  if (!listedModels) {
    try {
      const res = await fetch(`${GEMINI_BASE}/models?pageSize=200`, {
        headers: { 'x-goog-api-key': key },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { models?: Array<{ name: string; supportedGenerationMethods?: string[] }> };
        const ranked = rankFlashModels(
          (data.models ?? []).filter(m => m.supportedGenerationMethods?.includes('generateContent')).map(m => m.name),
        );
        if (ranked.length) listedModels = ranked;
      }
    } catch (err) {
      console.warn('Could not list Gemini models', err);
    }
  }
  const configured = Deno.env.get('GEMINI_MODEL')?.trim();
  const now = Date.now();
  const ranked = withBenchedLast(listedModels ?? FALLBACK_MODELS, m => (benchedUntil.get(m) ?? 0) > now);
  return [...new Set([...(configured ? [configured] : []), ...ranked])].slice(0, MAX_MODELS);
}

type Failure = 'timeout' | 'quota' | 'unavailable' | 'missing' | 'refused';
type Attempt = { ok: true; value: unknown } | { ok: false; failure: Failure; fatal?: HttpError };

async function askModel(model: string, key: string, body: string, signal: AbortSignal): Promise<Attempt> {
  let res: Response;
  try {
    res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body,
      signal,
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'TimeoutError';
    if (timedOut) {
      console.warn(`Gemini ${model} timed out`);
      benchedUntil.set(model, Date.now() + BENCH_MS);
    }
    return { ok: false, failure: timedOut ? 'timeout' : 'unavailable' };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn(`Gemini ${model} answered ${res.status}`, text.slice(0, 300));
    if (res.status === 429) return { ok: false, failure: 'quota' };
    if (res.status === 404) {
      if (listedModels) listedModels = listedModels.filter(m => m !== model);
      return { ok: false, failure: 'missing' };
    }
    if (res.status >= 500) {
      benchedUntil.set(model, Date.now() + BENCH_MS);
      return { ok: false, failure: 'unavailable' };
    }
    return { ok: false, failure: 'refused' };
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> }; finishReason?: string }>;
    promptFeedback?: { blockReason?: string };
  };
  if (data.promptFeedback?.blockReason) {
    return { ok: false, failure: 'refused', fatal: new HttpError(422, 'The AI service would not read these photos. Try different photos.') };
  }
  const text =
    data.candidates?.[0]?.content?.parts
      ?.filter(p => !p.thought)
      .map(p => p.text ?? '')
      .join('') ?? '';
  try {
    return { ok: true, value: parseJsonLoose(text) };
  } catch {
    return { ok: false, failure: 'refused' };
  }
}

function failureError(failures: Failure[]): HttpError {
  if (failures.includes('quota')) {
    return new HttpError(429, 'The AI service is at its free-tier limit for now. Try again in a minute, or add a paid key.');
  }
  if (failures.includes('timeout')) return new HttpError(504, 'The AI service took too long to answer. Try the scan again.');
  if (failures.length && failures.every(f => f === 'missing')) {
    return new HttpError(502, 'No current Gemini model is available for this key. Set GEMINI_MODEL to one that is.');
  }
  if (failures.includes('refused')) return new HttpError(502, 'The AI service refused the request. Try the scan again.');
  return new HttpError(502, 'The AI service is busy right now. Try the scan again in a minute.');
}

/**
 * Ask the models in turn, hedged: the first model starts at once, and each
 * later one starts when the one before has failed or has been quiet for
 * HEDGE_AFTER_MS. The first good answer wins and the rest are cancelled.
 * Some new models hang for minutes on some keys, so waiting for each in turn
 * would make a scan take as long as the slowest model.
 */
async function geminiJson(req: VisionRequest): Promise<unknown> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new HttpError(503, 'AI scanning is not set up: the server is missing GEMINI_API_KEY.');
  const models = await candidateModels(key);
  if (!models.length) throw failureError(['missing']);
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [
      {
        role: 'user',
        parts: [
          ...req.images.flatMap(img => [
            ...(img.caption ? [{ text: img.caption }] : []),
            { inlineData: { mimeType: img.mime, data: img.base64 } },
          ]),
          { text: req.prompt },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: toGeminiSchema(req.schema),
    },
  });

  const deadline = AbortSignal.timeout(TOTAL_BUDGET_MS);
  const cancel = new AbortController();
  const signal = AbortSignal.any([deadline, cancel.signal]);
  const failures: Failure[] = [];

  return await new Promise<unknown>((resolve, reject) => {
    let started = 0;
    let running = 0;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cancel.abort();
      fn();
    };

    const startNext = () => {
      clearTimeout(timer);
      if (done || started >= models.length) return;
      const model = models[started++]!;
      running++;
      void askModel(model, key, body, signal).then(result => {
        running--;
        if (done) return;
        if (result.ok) return finish(() => resolve(result.value));
        if (result.fatal) return finish(() => reject(result.fatal));
        failures.push(result.failure);
        if (started < models.length) startNext();
        else if (!running) finish(() => reject(failureError(failures)));
      });
      if (started < models.length) timer = setTimeout(startNext, HEDGE_AFTER_MS);
    };

    startNext();
  });
}

/** Models sometimes wrap JSON in a code fence; take the object either way. */
export function parseJsonLoose(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1]! : text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    throw new HttpError(502, 'The AI answer could not be read. Try the scan again.');
  }
}

export function visionJson(req: VisionRequest): Promise<unknown> {
  const provider = (Deno.env.get('AI_PROVIDER') ?? 'gemini').toLowerCase();
  switch (provider) {
    case 'gemini':
      return geminiJson(req);
    default:
      throw new HttpError(503, `AI_PROVIDER "${provider}" is not supported. Use "gemini".`);
  }
}
