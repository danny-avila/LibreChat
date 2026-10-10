const express = require('express');
const { MeoAccountProviderClient, MeoCloudConversationClient } = require('@librechat/api');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const router = express.Router();
// The broker is a Supabase Edge Function. The OIDC issuer is the same Supabase
// project with `/auth/v1` appended, so its origin is the safe API fallback. The
// Account website origin serves the Flutter app and cannot serve `/functions/v1`.
const accountUrl =
  process.env.MEO_ACCOUNT_URL ||
  (process.env.OPENID_ISSUER
    ? new URL(process.env.OPENID_ISSUER).origin
    : 'https://account.meoarch.org');
const clientId = process.env.MEO_ACCOUNT_OAUTH_CLIENT_ID || '';
const cloudUrl = process.env.MEO_CLOUD_URL || 'https://ai.meoarch.org';

router.use((_req, res, next) => {
  res.set({ 'Cache-Control': 'no-store' });
  next();
});

function sessionAccessToken(req) {
  const sessionTokens = req.session?.openidTokens;
  const sessionUserId = sessionTokens?.appUserId;
  const requestUserId = req.user?.id || req.user?._id?.toString?.();
  if (!sessionUserId || !requestUserId || sessionUserId !== requestUserId) return '';
  return sessionTokens?.accessToken || '';
}

function clientFor(req) {
  return new MeoAccountProviderClient({
    accountUrl,
    clientId,
    accessToken: async () => sessionAccessToken(req),
  });
}

function cloudFor(req) {
  return new MeoCloudConversationClient({
    cloudUrl,
    accessToken: async () => sessionAccessToken(req),
  });
}

function sendError(res, error) {
  const message = error instanceof Error ? error.message : 'Meo Account request failed';
  const status = message.includes('session is unavailable') ? 401 : 400;
  const safeMessage =
    status === 401
      ? 'Meo Account session is unavailable. Sign in again.'
      : 'Meo Account request failed. Check the connection and try again.';
  return res.status(status).json({ error: safeMessage });
}

router.get('/connections', requireJwtAuth, async (req, res) => {
  try {
    return res.json({ connections: await clientFor(req).listConnections() });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/conversations', requireJwtAuth, async (req, res) => {
  try {
    return res.json({ conversations: await cloudFor(req).listConversations() });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/conversations', requireJwtAuth, async (req, res) => {
  try {
    const conversation = await cloudFor(req).createConversation(req.body?.title);
    return res.status(201).json({ conversation });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/conversations/:conversationId/messages', requireJwtAuth, async (req, res) => {
  try {
    return res.json({ messages: await cloudFor(req).listMessages(req.params.conversationId) });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/conversations/:conversationId/messages', requireJwtAuth, async (req, res) => {
  try {
    const message = await cloudFor(req).appendMessage(
      req.params.conversationId,
      req.body?.role,
      req.body?.content,
    );
    return res.status(201).json({ message });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/connections/:credentialId/models', requireJwtAuth, async (req, res) => {
  try {
    return res.json(await clientFor(req).listModels(req.params.credentialId));
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/chat/prepare', requireJwtAuth, async (req, res) => {
  try {
    const consent = await clientFor(req).prepareChat(req.body);
    return res.json({ consent });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/chat/invoke', requireJwtAuth, async (req, res) => {
  try {
    const result = await clientFor(req).invokeChat(req.body);
    res.set({ 'Cache-Control': 'no-store' });
    return res.json(result);
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/chat/stream', requireJwtAuth, async (req, res) => {
  const controller = new AbortController();
  const abortOnDisconnect = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.once('close', abortOnDisconnect);
  try {
    const upstream = await clientFor(req).streamChat(req.body, controller.signal);
    res.status(upstream.status).set({
      'Cache-Control': 'no-store, no-transform',
      'Content-Type': 'text/event-stream; charset=utf-8',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    for await (const chunk of upstream.body) {
      if (controller.signal.aborted || res.destroyed) break;
      if (!res.write(chunk)) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
    }
    if (!res.destroyed && !res.writableEnded) res.end();
  } catch (error) {
    if (controller.signal.aborted || res.destroyed) return;
    if (res.headersSent) {
      res.write(
        `event: error\ndata: ${JSON.stringify({ message: 'Meo Account streaming failed.' })}\n\n`,
      );
      return res.end();
    }
    return sendError(res, error);
  } finally {
    res.removeListener('close', abortOnDisconnect);
  }
});

module.exports = router;
