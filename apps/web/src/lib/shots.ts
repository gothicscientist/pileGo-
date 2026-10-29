// What each scan photo shows. The seller is asked for three key shots (front,
// back, clothing label) plus any extras; the role travels with the photo to
// the AI and decides the cover.

import type { PhotoRole } from '@pilego/core';

export type KeyRole = Exclude<PhotoRole, 'extra'>;

/** The three photos every scan should have, in the order they are shown and sent. */
export const KEY_SHOTS: Array<{ role: KeyRole; label: string; tip: string; why: string }> = [
  { role: 'front', label: 'Front', tip: 'Laid flat, the whole piece in frame', why: 'shape, colour and style' },
  { role: 'back', label: 'Back', tip: 'Flip it over, same framing', why: 'back prints and wear' },
  { role: 'label', label: 'Label', tip: 'Brand, size and care tags, close and sharp', why: 'brand, size, fabric and measurements' },
];

export const ROLE_NAME: Record<PhotoRole, string> = { front: 'Front', back: 'Back', label: 'Label', extra: 'Extra' };
const ROLE_ORDER: Record<PhotoRole, number> = { front: 0, back: 1, label: 2, extra: 3 };

/** Front first (it is the cover), then back, label and the extras in the order they were added. */
export function orderShots<T extends { role: PhotoRole }>(shots: T[]): T[] {
  return shots
    .map((s, i) => ({ s, i }))
    .sort((a, b) => ROLE_ORDER[a.s.role] - ROLE_ORDER[b.s.role] || a.i - b.i)
    .map(x => x.s);
}

/** Roles for newly added photos: `first` for the first one if given, then the empty key slots in order, then extras. */
export function assignRoles(taken: PhotoRole[], count: number, first?: PhotoRole): PhotoRole[] {
  const used = new Set(taken.filter(r => r !== 'extra'));
  const out: PhotoRole[] = [];
  for (let i = 0; i < count; i++) {
    const role: PhotoRole = i === 0 && first ? first : (KEY_SHOTS.find(k => !used.has(k.role))?.role ?? 'extra');
    if (role !== 'extra') used.add(role);
    out.push(role);
  }
  return out;
}

/** Give one photo a role. A key role already held by another photo moves to that photo's old role. */
export function withRole<T extends { key: string; role: PhotoRole }>(shots: T[], key: string, role: PhotoRole): T[] {
  const old = shots.find(s => s.key === key)?.role ?? 'extra';
  return shots.map(s => {
    if (s.key === key) return { ...s, role };
    if (role !== 'extra' && s.role === role) return { ...s, role: old };
    return s;
  });
}

/** The key shots not taken yet, ignoring photos that failed to upload. */
export function missingShots(shots: Array<{ role: PhotoRole; state?: string }>) {
  return KEY_SHOTS.filter(k => !shots.some(s => s.role === k.role && s.state !== 'error'));
}

/** "front", "front or back", "front, back or label". */
export function listWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`;
}
