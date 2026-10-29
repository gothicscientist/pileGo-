// Firefox answers to `browser` and returns promises there; Chrome answers to
// `chrome` and has returned promises since MV3. One alias for both.
const g = globalThis as unknown as { browser?: typeof chrome; chrome?: typeof chrome };
export const ext: typeof chrome = (g.browser ?? g.chrome)!;

/**
 * False in a content script left behind when the extension was reloaded or
 * updated: the page keeps running it, but it can no longer reach the worker.
 */
export const alive = () => Boolean(ext.runtime?.id);

/**
 * sendMessage that never throws. An orphaned content script's sendMessage
 * throws "Extension context invalidated" before returning a promise, which a
 * .catch() never sees.
 */
export function send<T = unknown>(msg: unknown): Promise<T | undefined> {
  if (!alive()) return Promise.resolve(undefined);
  try {
    return (ext.runtime.sendMessage(msg) as Promise<T>).catch(() => undefined);
  } catch {
    return Promise.resolve(undefined);
  }
}

export const sleep = (ms: number) => new Promise<void>(done => setTimeout(done, ms));

/** A random whole number of milliseconds between low and high. */
export const between = (low: number, high: number) => low + Math.floor(Math.random() * (high - low + 1));

export function uuid(): string {
  return crypto.randomUUID();
}

export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
  return String(err);
}

/** Base64 survives Chrome's JSON message channel; ArrayBuffers do not. */
export function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(data: string, type: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at);
  return new Blob([bytes], { type });
}
