/**
 * BKL admin API auth: static Bearer token via `BKL_ADMIN_TOKEN`.
 * The admin dashboard now includes write operations (notices, surveys,
 * share revocation, model settings, hard-delete), so every route is gated.
 */
function requireAdminToken(req, res, next) {
  const configured = (process.env.BKL_ADMIN_TOKEN || '').trim();
  if (!configured) {
    return res.status(503).json({ error: 'BKL_ADMIN_TOKEN is not configured on the server' });
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (token !== configured) {
    return res.status(401).json({ error: 'invalid admin token' });
  }
  next();
}

module.exports = { requireAdminToken };
