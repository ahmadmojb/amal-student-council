/**
 * Certificate verification codes.
 * - 100 bits from the OS CSPRNG, Crockford base32, grouped for readability:
 *   e.g. "7K2QD-M9XAF-3RTHW-PZ4NC" (no sequential or guessable component).
 * - Only SHA-256(normalised code) is stored; the raw code exists only on the
 *   printed certificate and its QR link.
 */
import { createHash, randomBytes } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (no I, L, O, U)
export const CODE_LENGTH = 20;

export function generateCertificateCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let raw = '';
  // 256 is a multiple of 32, so `byte % 32` is unbiased.
  for (let i = 0; i < CODE_LENGTH; i++) raw += ALPHABET[(bytes[i] as number) % 32];
  return raw.match(/.{1,5}/g)!.join('-');
}

/** Accepts lowercase, spaces, missing dashes and the usual look-alike characters. */
export function normalizeCertificateCode(input: string): string | null {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  if (cleaned.length !== CODE_LENGTH) return null;
  for (const ch of cleaned) if (!ALPHABET.includes(ch)) return null;
  return cleaned;
}

export function hashCertificateCode(normalized: string): string {
  return createHash('sha256').update(`amal-cert:v1:${normalized}`).digest('hex');
}
