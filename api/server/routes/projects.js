const express = require('express');
const { createProjectHandlers } = require('@librechat/api');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { logger } = require('~/config');
const db = require('~/models');

const router = express.Router();
const handlers = createProjectHandlers({
  listChatProjects: db.listChatProjects,
  createChatProject: db.createChatProject,
  getChatProject: db.getChatProject,
  updateChatProject: db.updateChatProject,
  deleteChatProject: db.deleteChatProject,
  assignConversationToProject: db.assignConversationToProject,
});

router.use(requireJwtAuth);

/**
 * JetCode platform hook: a project created in the UI provisions a platform
 * project (Linux workspace, tmux session, Claude Code) behind the scenes.
 * The client never interacts with any of that — the project simply becomes
 * usable as a model in the JetCode endpoint.
 *
 * 409 from the platform means every paid tariff already pays for a project;
 * the UI project is still created (it is a folder for conversations), the
 * error is surfaced in the response for the client UI to explain.
 */
async function provisionPlatformProject(req, name) {
  const base = (process.env.PLATFORM_URL || '').replace(/\/$/, '');
  if (!base) {
    return null;
  }
  const res = await fetch(`${base}/internal/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ email: req.user.email, project_name: name }),
    signal: AbortSignal.timeout(30000),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 409) {
    return { error: 'no_free_slot', detail: body.error };
  }
  if (!res.ok) {
    throw new Error(`platform responded ${res.status}`);
  }
  logger.info(
    `[projects] platform provisioned ${body.project_id} (${body.project_state}) for ${req.user.email}`,
  );
  return body;
}

router.get('/', handlers.listProjects);
router.post('/', async (req, res) => {
  // Let the stock handler validate and create the LibreChat project first…
  let captured;
  const proxy = Object.create(res);
  proxy.status = (code) => {
    res.status(code);
    return proxy;
  };
  proxy.json = (payload) => {
    captured = { code: res.statusCode, payload };
    return proxy;
  };
  await handlers.createProject(req, proxy);

  if (!captured) {
    return res.end();
  }
  if (captured.code !== 201) {
    return res.status(captured.code).json(captured.payload);
  }

  // …then provision the platform side. A project without its platform half
  // is a lie (no model, no Claude), so failures ROLL BACK the UI project
  // and surface a real error instead of a fake success.
  let platform = null;
  let failure = null;
  try {
    platform = await provisionPlatformProject(req, captured.payload?.name || 'Проект');
    if (platform?.error === 'no_free_slot') {
      failure = platform.detail || 'Нет оплаченного тарифа под новый проект — оплатите тариф в разделе /billing и попробуйте снова.';
    }
  } catch (error) {
    logger.error('[projects] platform provisioning failed', error);
    failure = 'Платформа временно недоступна — попробуйте создать проект ещё раз через минуту.';
  }

  if (failure) {
    const projectId = captured.payload?._id || captured.payload?.id;
    if (projectId) {
      try {
        await db.deleteChatProject(req.user?.id ?? String(req.user?._id), String(projectId));
      } catch (error) {
        logger.error('[projects] rollback of UI project failed', error);
      }
    }
    return res.status(402).json({ error: failure });
  }

  return res.status(201).json({ ...captured.payload, platform });
});
router.put('/conversations/:conversationId', handlers.assignConversationToProject);
router.get('/:projectId', handlers.getProject);
router.patch('/:projectId', handlers.updateProject);
router.delete('/:projectId', handlers.deleteProject);

module.exports = router;
