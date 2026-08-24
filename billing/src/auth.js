import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { User } from './db.js';

// Authenticates the browser via LibreChat's own refreshToken cookie (httpOnly,
// path=/, signed with JWT_REFRESH_SECRET, payload { id, sessionId }). Because
// the billing app lives on the same origin under /billing, the cookie arrives
// with every request — no separate login.
export async function requireUser(req, res, next) {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return res.redirect('/login');
    const payload = jwt.verify(token, config.jwtRefreshSecret);
    const user = await User.findById(payload.id).lean();
    if (!user) return res.redirect('/login');
    req.user = user;
    next();
  } catch {
    return res.redirect('/login');
  }
}

// Same check as requireUser, but for JSON endpoints: 401 instead of redirect.
export async function requireUserApi(req, res, next) {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    const payload = jwt.verify(token, config.jwtRefreshSecret);
    const user = await User.findById(payload.id).lean();
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).render('error', {
      user: req.user,
      title: 'Доступ запрещён',
      message: 'Раздел доступен только администраторам.',
    });
  }
  next();
}

// CSRF hardening for state-changing routes: the auth cookie is SameSite=Strict,
// so cross-site POSTs cannot carry it; additionally reject foreign origins.
export function sameOrigin(req, res, next) {
  const origin = req.get('origin');
  if (origin && origin !== config.publicUrl) {
    return res.status(403).send('Forbidden');
  }
  next();
}
