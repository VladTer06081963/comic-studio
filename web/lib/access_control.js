import crypto from 'crypto';
import { forbidden, unauthorized } from './errors.js';

function sameToken(actual, expected) {
  const a = Buffer.from(String(actual || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function isSameOrigin(origin, req) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return url.host === req.get('host') && ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

export function accessControlMiddleware(config) {
  return (req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();
    const origin = req.get('origin');
    if (!config.remoteMode) {
      if (origin && !isSameOrigin(origin, req)) return next(forbidden());
      return next();
    }

    if (origin && !config.allowedOrigins.includes(origin)) return next(forbidden());
    if (origin) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Request-ID');
      res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!sameToken(token, config.apiToken)) return next(unauthorized());
    next();
  };
}
