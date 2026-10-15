const express = require('express');
const {
  MeoAccountProviderClient,
  MeoCloudConversationClient,
  meoErrorResponse,
} = require('@librechat/api');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const router = express.Router();
// Meo API owns the provider broker and persisted history; Account owns OAuth.
const apiUrl = process.env.MEO_API_URL || 'https://api.meoarch.org';
const clientId = process.env.MEO_ACCOUNT_OAUTH_CLIENT_ID || '';

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
    apiUrl,
    clientId,
    accessToken: async () => sessionAccessToken(req),
  });
}

function cloudFor(req) {
  return new MeoCloudConversationClient({
    apiUrl,
    accessToken: async () => sessionAccessToken(req),
  });
}

function sendError(res, error) {
  const { status, message } = meoErrorResponse(error);
  return res.status(status).json({ error: message });
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
    return res.json(await cloudFor(req).listConversations(req.query.cursor));
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
