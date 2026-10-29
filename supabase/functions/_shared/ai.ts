// Vision model adapter. Gemini is the default because its free tier covers a
// seller's daily scanning; any provider that takes images and returns JSON can
// be added behind the same function.

import { HttpError } from './http.ts';

export interface VisionImage {
  mime: string;
  base64: string;
}

export interface VisionRequest {
  system: string;
  prompt: string;
  images: VisionImage[];
  schema: Record<string, unknown>;
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
let resolvedModel: string | null = null;

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

async function pickGeminiModel(key: string): Promise<string> {
  if (resolvedModel) return resolvedModel;
  const configured = Deno.env.get('GEMINI_MODEL');
  if (configured) return (resolvedModel = configured);
  // Ask which models this key can use and take the newest Flash model, so the
  // app keeps working when Google retires an older one.
  try {
    const res = await fetch(`${GEMINI_BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
    if (res.ok) {
      const data = (await res.json()) as { models?: Array<{ name: string; supportedGenerationMethods?: string[] }> };
      const flash = (data.models ?? [])
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => m.name.replace(/^models\//, ''))
        .filter(n => /^gemini-[\d.]+-flash$/.test(n) || /^gemini-[\d.]+-flash-latest$/.test(n) || n === 'gemini-flash-latest')
        .sort((a, b) => versionOf(b) - versionOf(a));
      if (flash[0]) return (resolvedModel = flash[0]);
    }
  } catch (err) {
    console.warn('Could not list Gemini models', err);
  }
  return (resolvedModel = 'gemini-flash-latest');
}

function versionOf(name: string): number {
  if (name === 'gemini-flash-latest') return 999;
  const match = name.match(/gemini-([\d.]+)/);
  return match ? Number.parseFloat(match[1]!) : 0;
}

async function geminiJson(req: VisionRequest): Promise<unknown> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new HttpError(503, 'AI scanning is not set up: the server is missing GEMINI_API_KEY.');
  const model = await pickGeminiModel(key);

  const body = {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [
      {
        role: 'user',
        parts: [
          ...req.images.map(img => ({ inlineData: { mimeType: img.mime, data: img.base64 } })),
          { text: req.prompt },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: toGeminiSchema(req.schema),
    },
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
    });
    if (res.status === 429 || res.status >= 500) {
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      if (res.status === 429) {
        throw new HttpError(429, 'The AI service is at its free-tier limit for now. Try again in a minute, or add a paid key.');
      }
    }
    if (res.status === 404) {
      resolvedModel = null;
      throw new HttpError(502, `The AI model "${model}" is not available for this key. Set GEMINI_MODEL to a current model.`);
    }
    if (!res.ok) {
      const text = await res.text();
      console.error('Gemini error', res.status, text.slice(0, 500));
      throw new HttpError(502, 'The AI service refused the request.', { status: res.status });
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      promptFeedback?: { blockReason?: string };
    };
    if (data.promptFeedback?.blockReason) {
      throw new HttpError(422, 'The AI service would not read these photos. Try different photos.');
    }
    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
    return parseJsonLoose(text);
  }
  throw new HttpError(502, 'The AI service did not answer.');
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
