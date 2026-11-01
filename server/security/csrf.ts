/**
 * CSRF protection for the cookie-based admin session.
 * Layers: SameSite=Strict cookie + a required custom header (which a
 * cross-site form or simple request cannot set) + an Origin/Referer check
 * against the configured site origin on every state-changing request.
 */
import type { Request, Response, NextFunction } from 'express';
import type { ServerConfig } from '../config.js';

export const CSRF_HEADER = 'x-amal-request';
export const CSRF_VALUE = '1';

export function allowedOrigins(config: ServerConfig, req: Request): Set<string> {
  const set = new Set<string>();
  if (config.publicSiteUrl) set.add(new URL(config.publicSiteUrl).origin);
  if (!config.isProd) {
    // Development: accept the origin the request was addressed to.
    const host = req.get('host');
    if (host) {
      set.add(`http://${host}`);
      set.add(`https://${host}`);
    }
  }
  return set;
}

export function csrfGuard(config: ServerConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    if (req.get(CSRF_HEADER) !== CSRF_VALUE) {
      res.status(403).json({ error: 'csrf', message: 'طلب مرفوض.' });
      return;
    }
    const origin = req.get('origin') ?? (req.get('referer') ? safeOrigin(req.get('referer') as string) : null);
    if (!origin || !allowedOrigins(config, req).has(origin)) {
      res.status(403).json({ error: 'csrf', message: 'مصدر الطلب غير مسموح.' });
      return;
    }
    next();
  };
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
