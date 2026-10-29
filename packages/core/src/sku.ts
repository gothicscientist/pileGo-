const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * A short SKU a person can write on a bin label: a category prefix and five
 * characters without look-alikes (no 0/O, 1/I/L). "OUT-7KQ2M".
 */
export function makeSku(category: string | null | undefined, random: () => number = Math.random): string {
  const prefix = (category ?? 'itm').replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
  let body = '';
  for (let i = 0; i < 5; i++) body += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return `${prefix}-${body}`;
}
