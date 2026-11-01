import { describe, expect, it } from 'vitest';
import { generateCertificateCode, hashCertificateCode, normalizeCertificateCode } from '../../server/security/certificates';
import { constantTimeEquals, createSessionToken, parseCookies, readSessionToken } from '../../server/security/session';
import { sniffType } from '../../server/services/media';
import { sniffVideo } from '../../server/services/video-storage';
import { readFileSync } from 'node:fs';
import { readConfig } from '../../server/config';

describe('certificate codes', () => {
  it('are 20 Crockford-base32 characters from a CSPRNG, grouped by 5', () => {
    const codes = new Set(Array.from({ length: 2000 }, generateCertificateCode));
    expect(codes.size).toBe(2000);
    for (const c of [...codes].slice(0, 50)) expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/);
  });

  it('normalises user input and look-alike characters', () => {
    const code = generateCertificateCode();
    const n = normalizeCertificateCode(code)!;
    expect(normalizeCertificateCode(code.toLowerCase().replace(/-/g, ' '))).toBe(n);
    expect(normalizeCertificateCode('O0I1L-00000-00000-00000')).toBe('00111000000000000000');
    expect(normalizeCertificateCode('short')).toBeNull();
    expect(normalizeCertificateCode('UUUUU-UUUUU-UUUUU-UUUUU')).toBeNull();
  });

  it('stores only a stable SHA-256 digest', () => {
    const h = hashCertificateCode('ABCDEFGHJKMNPQRSTVWX');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(hashCertificateCode('ABCDEFGHJKMNPQRSTVWX')).toBe(h);
    expect(h).not.toContain('ABCDE');
  });
});

describe('admin sessions', () => {
  const secret = 'x'.repeat(40);
  it('round-trips a signed token and rejects tampering', () => {
    const { token, payload } = createSessionToken(secret, 60);
    expect(readSessionToken(token, secret)?.sid).toBe(payload.sid);
    expect(readSessionToken(token, 'y'.repeat(40))).toBeNull();
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...payload, exp: payload.exp + 1e9 })).toString('base64url');
    expect(readSessionToken(`${forged}.${sig}`, secret)).toBeNull();
    expect(readSessionToken(`${body}.`, secret)).toBeNull();
  });

  it('expires', () => {
    const { token } = createSessionToken(secret, 5, Date.now() - 10 * 60_000);
    expect(readSessionToken(token, secret)).toBeNull();
  });

  it('compares secrets in constant time regardless of length', () => {
    expect(constantTimeEquals('abc', 'abc')).toBe(true);
    expect(constantTimeEquals('abc', 'abcd')).toBe(false);
  });

  it('parses cookies defensively', () => {
    expect(parseCookies('a=1; b=%D8%B9; c')).toEqual({ a: '1', b: 'ع' });
    expect(parseCookies(undefined)).toEqual({});
  });
});

describe('upload sniffing', () => {
  it('identifies files by magic bytes, not names', () => {
    expect(sniffType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffType(Buffer.from('%PDF-1.7'))).toBe('application/pdf');
    expect(sniffType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffType(Buffer.from('MZ\x90\x00'))).toBeNull();
  });
});

describe('schedule video sniffing', () => {
  it('accepts MP4 and WebM by container signature only', () => {
    expect(sniffVideo(readFileSync('tests/fixtures/schedule.mp4').subarray(0, 64))).toBe('video/mp4');
    expect(sniffVideo(readFileSync('tests/fixtures/schedule.webm').subarray(0, 64))).toBe('video/webm');
    expect(sniffVideo(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
    const mov = Buffer.alloc(16);
    mov.write('ftypqt  ', 4, 'latin1');
    expect(sniffVideo(mov)).toBeNull();
  });
});

describe('configuration safety', () => {
  it('refuses production without secrets and never enters demo implicitly', () => {
    expect(() => readConfig({ NODE_ENV: 'production' })).toThrow(/DATA_MODE/);
    expect(() => readConfig({ NODE_ENV: 'production', DATA_MODE: 'production' })).toThrow(/ADMIN_PIN/);
    expect(() => readConfig({ NODE_ENV: 'production', DATA_MODE: 'demo', SESSION_SECRET: 'x'.repeat(40), PUBLIC_SITE_URL: 'https://a.b' })).toThrow(/ADMIN_PIN/);
  });

  it('allows the demo PIN only in demo mode outside production', () => {
    const c = readConfig({ NODE_ENV: 'development' });
    expect(c.dataMode).toBe('demo');
    expect(c.usingDemoPin).toBe(true);
    expect(() =>
      readConfig({ NODE_ENV: 'production', DATA_MODE: 'production', ADMIN_PIN: 'demo-1234', SESSION_SECRET: 'x'.repeat(40), PUBLIC_SITE_URL: 'https://a.b', FIREBASE_DATABASE_URL: 'https://x.firebaseio.com', PUBLIC_FIREBASE_API_KEY: 'k', PUBLIC_FIREBASE_PROJECT_ID: 'p' }),
    ).toThrow();
  });
});
