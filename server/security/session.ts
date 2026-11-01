/**
 * Administrator authentication.
 *
 * - A single shared PIN/password lives in ADMIN_PIN (server env only).
 * - Comparison is constant-time over SHA-256 digests (equal length).
 * - A successful login issues an HMAC-signed, HttpOnly, SameSite=Strict
 *   session cookie with an absolute expiry. Logout revokes the session id
 *   in the database so a stolen cookie stops working everywhere.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction, CookieOptions } from 'express';
import type { Store } from '../store/types.js';
import type { ServerConfig } from '../config.js';

export const SESSION_COOKIE = 'amal_admin';

export interface SessionPayload {
  sid: string;
  iat: number;
  exp: number;
}

export function sha256(input: string | Buffer): Buffer {
  return createHash('sha256').update(input).digest();
}

export function constantTimeEquals(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function createSessionToken(secret: string, ttlMinutes: number, now = Date.now()): { token: string; payload: SessionPayload } {
  const payload: SessionPayload = { sid: randomBytes(16).toString('hex'), iat: now, exp: now + ttlMinutes * 60_000 };
  const body = b64url(JSON.stringify(payload));
  return { token: `${body}.${sign(body, secret)}`, payload };
}

export function readSessionToken(token: string | undefined, secret: string, now = Date.now()): SessionPayload | null {
  if (!token || token.length > 1000) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = sign(body, secret);
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (typeof payload.sid !== 'string' || !/^[a-f0-9]{32}$/.test(payload.sid) || typeof payload.exp !== 'number') return null;
    if (payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k || k in out) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function sessionCookieOptions(config: ServerConfig, maxAgeMs?: number): CookieOptions {
  return {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'strict',
    path: '/',
    ...(maxAgeMs !== undefined ? { maxAge: maxAgeMs } : {}),
  };
}

declare module 'express-serve-static-core' {
  interface Request {
    adminSession?: SessionPayload;
  }
}

export async function loadSession(req: Request, config: ServerConfig, store: Store): Promise<SessionPayload | null> {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  const payload = readSessionToken(token, config.sessionSecret);
  if (!payload) return null;
  const revoked = await store.get<number>(`private/revokedSessions/${payload.sid}`);
  return revoked ? null : payload;
}

export function requireAdmin(config: ServerConfig, store: Store) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await loadSession(req, config, store);
      if (!session) {
        res.status(401).json({ error: 'unauthorized', message: 'انتهت الجلسة أو لم يتم تسجيل الدخول.' });
        return;
      }
      req.adminSession = session;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export async function revokeSession(store: Store, session: SessionPayload): Promise<void> {
  await store.set(`private/revokedSessions/${session.sid}`, session.exp);
}

/** Removes revocation entries whose sessions have expired anyway. */
export async function pruneRevokedSessions(store: Store, now = Date.now()): Promise<void> {
  const all = (await store.get<Record<string, number>>('private/revokedSessions')) ?? {};
  const updates: Record<string, null> = {};
  for (const [sid, exp] of Object.entries(all)) if (exp < now) updates[`private/revokedSessions/${sid}`] = null;
  if (Object.keys(updates).length) await store.update(updates);
}
