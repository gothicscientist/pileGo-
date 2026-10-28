// Generated from packages/core/src by scripts/sync-core.mjs. Do not edit.
/** Cut text to `max` characters at a word boundary, without a dangling separator. */
export function clampWords(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (max <= 0 || clean.length <= max) return clean;
  const cut = clean.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : clean.slice(0, max);
  return base.replace(/[\s,;:\-–—|/]+$/, '');
}

/** Cut a multi-line description to `max` characters, ending on a whole line or sentence. */
export function clampParagraphs(text: string, max: number): string {
  if (max <= 0 || text.length <= max) return text;
  const cut = text.slice(0, max);
  const lineEnd = cut.lastIndexOf('\n');
  if (lineEnd > max * 0.4) return cut.slice(0, lineEnd).trimEnd();
  const sentenceEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'));
  if (sentenceEnd > max * 0.5) return cut.slice(0, sentenceEnd + 1).trimEnd();
  return clampWords(cut, max - 1) + '…';
}

export function titleCase(text: string): string {
  return text
    .split(' ')
    .map(w => (w.length > 2 && w === w.toLowerCase() ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** "Y2K baby tee" → "#y2k #babytee". Keeps letters and digits only. */
export function toHashtag(text: string): string | null {
  const tag = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
  return tag.length >= 2 ? `#${tag}` : null;
}

export function uniqueBy<T>(list: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const value of list) {
    const k = key(value);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(value);
  }
  return out;
}

/** Remove whole words the seller asked never to use. */
export function stripWords(text: string, words: string[]): string {
  let out = text;
  for (const word of words) {
    if (!word.trim()) continue;
    const escaped = word.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '');
  }
  return out.replace(/[ \t]{2,}/g, ' ').replace(/ +([,.!?])/g, '$1');
}

export function formatMoney(amount: number | null | undefined, currency = 'USD', locale?: string): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function roundPrice(value: number): number {
  // Prices that look chosen by a person: whole numbers under 100, steps of 5 above.
  if (value <= 0) return 0;
  if (value < 10) return Math.round(value * 2) / 2;
  if (value < 100) return Math.round(value);
  return Math.round(value / 5) * 5;
}
