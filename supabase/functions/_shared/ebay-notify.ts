// Verifying that a notification really comes from eBay. Every notification
// carries an X-EBAY-SIGNATURE header: base64 JSON { alg, kid, signature,
// digest }. The signature is an ECDSA (SHA-1) signature, DER encoded, over the
// JSON body, made with the key that the Notification API's getPublicKey
// returns for `kid`. This mirrors eBay's own event-notification SDKs.
// https://developer.ebay.com/api-docs/commerce/notification/resources/public_key/methods/getPublicKey

import { decodeBase64 } from 'jsr:@std/encoding@1/base64';

export interface SignatureHeader {
  alg?: string;
  kid: string;
  signature: string;
  digest?: string;
}

export interface PublicKey {
  /** PEM, sometimes without the line breaks after BEGIN and before END. */
  key: string;
  algorithm?: string;
  digest?: string;
}

export function parseSignatureHeader(header: string | null): SignatureHeader | null {
  if (!header) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(decodeBase64(header.trim()))) as SignatureHeader;
    return parsed && typeof parsed.kid === 'string' && typeof parsed.signature === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s+/g, '');
  return new Uint8Array(decodeBase64(body));
}

/** WebCrypto wants ECDSA signatures as raw r||s; eBay sends ASN.1 DER. */
export function derToRaw(der: Uint8Array, size = 32): Uint8Array<ArrayBuffer> {
  if (der[0] !== 0x30) throw new Error('Not a DER signature');
  let i = 2;
  if (der[1]! & 0x80) i = 2 + (der[1]! & 0x7f);
  const read = (): Uint8Array => {
    if (der[i] !== 0x02) throw new Error('Bad DER integer');
    const len = der[i + 1]!;
    let int = der.slice(i + 2, i + 2 + len);
    i += 2 + len;
    while (int.length > size && int[0] === 0) int = int.slice(1);
    if (int.length > size) throw new Error('DER integer too long');
    const out = new Uint8Array(size);
    out.set(int, size - int.length);
    return out;
  };
  const r = read();
  const s = read();
  const raw = new Uint8Array(size * 2);
  raw.set(r, 0);
  raw.set(s, size);
  return raw;
}

const curveFor = (der: Uint8Array): { namedCurve: string; size: number } => {
  // The SPKI names its curve by OID; P-256 is what eBay uses today.
  const hex = [...der.slice(0, 40)].map(b => b.toString(16).padStart(2, '0')).join('');
  if (hex.includes('2b81040022')) return { namedCurve: 'P-384', size: 48 };
  if (hex.includes('2b81040023')) return { namedCurve: 'P-521', size: 66 };
  return { namedCurve: 'P-256', size: 32 };
};

/**
 * True when `body` was signed by eBay. eBay's SDKs verify over
 * JSON.stringify(parsed body), which for eBay's compact JSON is the raw body;
 * both are tried so whitespace differences cannot cause a false rejection.
 */
export async function verifySignature(body: string, header: SignatureHeader, publicKey: PublicKey): Promise<boolean> {
  const der = pemToDer(publicKey.key);
  const { namedCurve, size } = curveFor(der);
  const key = await crypto.subtle.importKey('spki', der, { name: 'ECDSA', namedCurve }, false, ['verify']);
  const hash = (publicKey.digest ?? header.digest ?? 'SHA1').toUpperCase().replace(/^SHA-?/, 'SHA-');
  let signature: Uint8Array<ArrayBuffer>;
  try {
    const bytes = decodeBase64(header.signature);
    signature = bytes[0] === 0x30 ? derToRaw(bytes, size) : new Uint8Array(bytes);
  } catch {
    return false;
  }
  const candidates = [body];
  try {
    const compact = JSON.stringify(JSON.parse(body));
    if (compact !== body) candidates.push(compact);
  } catch {
    return false;
  }
  for (const text of candidates) {
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash }, key, signature, new TextEncoder().encode(text));
    if (ok) return true;
  }
  return false;
}

const keyCache = new Map<string, { key: PublicKey; until: number }>();

/** getPublicKey, cached for an hour as eBay asks. */
export async function publicKeyFor(
  kid: string,
  fetchKey: (kid: string) => Promise<PublicKey>,
  now = Date.now(),
): Promise<PublicKey> {
  const hit = keyCache.get(kid);
  if (hit && hit.until > now) return hit.key;
  const key = await fetchKey(kid);
  keyCache.set(kid, { key, until: now + 3600_000 });
  return key;
}
