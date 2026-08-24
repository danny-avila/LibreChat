import { Router } from 'express';
import { requireUser, sameOrigin } from '../auth.js';
import { config } from '../config.js';

// "Подключение Claude" — the client-facing side of flow A2. The client sees
// a project list, an auth link and a code field; the platform drives
// `claude setup-token` in a hidden tmux session behind these calls.

export const claudeRoutes = Router();

async function platform(method, path, body) {
  const res = await fetch(`${config.platformUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

claudeRoutes.get('/claude', requireUser, async (req, res) => {
  if (!config.platformUrl) {
    return res.status(503).render('error', {
      user: req.user, title: 'Недоступно', message: 'Интеграция с платформой не настроена.',
    });
  }
  const { json } = await platform(
    'GET',
    `/internal/projects?email=${encodeURIComponent(req.user.email)}`,
  );
  res.render('claude', {
    user: req.user,
    projects: json.projects || [],
    freeSlots: json.free_slots || 0,
    linked: req.query.linked,
    error: req.query.error,
  });
});

claudeRoutes.post('/claude/:projectId/link', requireUser, sameOrigin, async (req, res) => {
  const { ok, json } = await platform(
    'POST',
    `/internal/projects/${encodeURIComponent(req.params.projectId)}/credential/link`,
  );
  if (!ok) {
    const message = json.error || 'Не удалось начать привязку. Попробуйте ещё раз.';
    return res.redirect(`${config.basePath}/claude?error=${encodeURIComponent(message)}`);
  }
  res.render('claude-link', {
    user: req.user,
    projectId: req.params.projectId,
    authUrl: json.auth_url,
    expiresAt: json.expires_at,
  });
});

claudeRoutes.post('/claude/:projectId/code', requireUser, sameOrigin, async (req, res) => {
  const { ok, json } = await platform(
    'POST',
    `/internal/projects/${encodeURIComponent(req.params.projectId)}/credential/code`,
    { code: String(req.body.code || '') },
  );
  if (!ok) {
    const message = json.error || 'Код не принят. Начните привязку заново.';
    return res.redirect(`${config.basePath}/claude?error=${encodeURIComponent(message)}`);
  }
  res.redirect(`${config.basePath}/claude?linked=1`);
});
