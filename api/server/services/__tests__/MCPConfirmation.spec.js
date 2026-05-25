/**
 * Integration test for the MCP tool-call confirmation flow.
 *
 * Drives `createToolInstance` end-to-end:
 *   1. Mock the upstream gateway so the FIRST callTool returns a
 *      `confirmationRequired:true` envelope and the SECOND returns a real
 *      result.
 *   2. Invoke the LangChain tool's `_call` (same path as the agent loop).
 *   3. Capture the `mcp_confirmation_required` SSE event so we can grab the
 *      generated confirmationId.
 *   4. POST to `/api/mcp/confirm/:id` (the real route, mounted on a mini
 *      Express app) with `{decision: 'accept'}`.
 *   5. Verify the wrapper resumed, re-issued the tool call with IDENTICAL
 *      args, and returned the upstream result to the agent.
 *
 * Also covers the cancel and timeout paths, where the LLM must see only a
 * synthesized `{success: false, canceled: true}` stub — never the envelope.
 */

const express = require('express');
const request = require('supertest');

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCallTool = jest.fn();
const mockGetMCPManager = jest.fn(() => ({ callTool: mockCallTool }));
const mockFlowsCache = {};
const mockFlowManager = {
  createFlowWithHandler: jest.fn(async (_id, _kind, fn) => fn()),
  failFlow: jest.fn(),
};

jest.mock('~/config', () => ({
  getOAuthReconnectionManager: jest.fn(),
  getMCPServersRegistry: jest.fn(() => ({ getServerConfig: jest.fn() })),
  getFlowStateManager: jest.fn(() => mockFlowManager),
  getMCPManager: (...args) => mockGetMCPManager(...args),
}));

jest.mock('~/cache', () => ({
  getLogStores: jest.fn(() => mockFlowsCache),
}));

jest.mock('~/models', () => ({
  findToken: jest.fn(),
  createToken: jest.fn(),
  updateToken: jest.fn(),
  deleteTokens: jest.fn(),
  findPluginAuthsByKeys: jest.fn(),
  getRoleByName: jest.fn(),
}));

jest.mock('~/server/services/GraphTokenService', () => ({
  getGraphApiToken: jest.fn(),
}));

jest.mock('~/server/services/Tools/mcp', () => ({
  reinitMCPServer: jest.fn(),
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn().mockResolvedValue({ mcpSettings: {} }),
}));

jest.mock('~/server/services/PluginService', () => ({
  getUserPluginAuthValue: jest.fn(),
}));

jest.mock('~/server/services/Config/mcp', () => ({
  updateMCPServerTools: jest.fn(),
}));

jest.mock('~/server/controllers/mcp', () => ({
  createMCPServerController: jest.fn(),
  updateMCPServerController: jest.fn(),
  deleteMCPServerController: jest.fn(),
  getMCPServersList: jest.fn(),
  getMCPServerById: jest.fn(),
  getMCPTools: jest.fn(),
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, _res, next) => {
    req.user = req.__testUser || { id: 'user-1' };
    next();
  },
  canAccessMCPServerResource: () => (_req, _res, next) => next(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

const { createToolInstance } = require('~/server/services/MCP');
const { getConfirmationStore } = require('@librechat/api');
const mcpRoutes = require('~/server/routes/mcp');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildEnvelopeResult(provider) {
  const envelope = JSON.stringify({
    confirmationRequired: true,
    preview: 'Tool: send-chat-message\n  chatId: "19:..."\n  body: {"content":"hello"}',
    expiresInSeconds: 60,
    instruction: 'STOP. Do NOT...',
  });
  if (['google', 'anthropic', 'azureopenai', 'openai'].includes(provider)) {
    return [[{ type: 'text', text: envelope }], undefined];
  }
  return [envelope, undefined];
}

function buildRealResult(provider) {
  const text = JSON.stringify({ success: true, messageId: 'abc-123' });
  if (['google', 'anthropic', 'azureopenai', 'openai'].includes(provider)) {
    return [[{ type: 'text', text }], undefined];
  }
  return [text, undefined];
}

/**
 * Captures every SSE chunk written through `sendEvent` so we can extract the
 * confirmationId without coupling to internal helpers.
 */
function makeFakeRes() {
  const written = [];
  return {
    write: (chunk) => {
      written.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    },
    written,
    parseEvents() {
      return written
        .map((s) => {
          const m = s.match(/^event: message\ndata: (.*)\n\n$/s);
          if (!m) return null;
          try {
            return JSON.parse(m[1]);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    },
  };
}

function makeToolCallConfig({ user, signal, provider }) {
  return {
    signal,
    metadata: {
      provider,
      thread_id: 'thread-x',
      run_id: 'run-x',
    },
    toolCall: {
      id: 'tc-1',
      name: 'send_chat_message',
      stepId: 'step-1',
      type: 'tool_call',
    },
    configurable: { user },
  };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.__testUser = { id: 'user-1' };
    next();
  });
  app.use('/api/mcp', mcpRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MCP confirmation flow (integration)', () => {
  const provider = 'openai';

  beforeEach(() => {
    mockCallTool.mockReset();
  });

  it('user accepts → wrapper re-issues identical args → upstream result reaches the agent', async () => {
    mockCallTool
      .mockResolvedValueOnce(buildEnvelopeResult(provider))
      .mockResolvedValueOnce(buildRealResult(provider));

    const res = makeFakeRes();
    const tool = createToolInstance({
      res,
      toolName: 'send_chat_message',
      serverName: 'ms365',
      provider,
      toolDefinition: {
        description: 'Send a chat',
        parameters: {
          type: 'object',
          properties: { chatId: { type: 'string' }, body: { type: 'string' } },
          required: ['chatId', 'body'],
        },
      },
    });

    const args = { chatId: '19:abc', body: 'hello' };
    const config = makeToolCallConfig({ user: { id: 'user-1' }, provider });

    const callPromise = tool.func(args, { getChild: () => undefined }, config);

    // Poll for the SSE event carrying the confirmationId.
    let confirmationId = null;
    for (let i = 0; i < 50 && !confirmationId; i++) {
      await new Promise((r) => setTimeout(r, 10));
      const events = res.parseEvents();
      const ev = events.find((e) => e.event === 'mcp_confirmation_required');
      if (ev) confirmationId = ev.data.confirmationId;
    }
    expect(confirmationId).toBeTruthy();

    // The wrapper must STILL be awaiting — the agent loop is suspended.
    let resolved = false;
    callPromise.then(() => {
      resolved = true;
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(resolved).toBe(false);
    expect(mockCallTool).toHaveBeenCalledTimes(1);

    // Hit the real REST endpoint as the originating user.
    const app = buildApp();
    const httpRes = await request(app)
      .post(`/api/mcp/confirm/${confirmationId}`)
      .send({ decision: 'accept' });
    expect(httpRes.status).toBe(204);

    const result = await callPromise;

    // Wrapper re-called with identical args (Phase 2 args-hash match).
    expect(mockCallTool).toHaveBeenCalledTimes(2);
    expect(mockCallTool.mock.calls[0][0].toolArguments).toBe(args);
    expect(mockCallTool.mock.calls[1][0].toolArguments).toBe(args);

    // The agent sees the upstream result, NOT the envelope.
    // For openai (CONTENT_ARRAY_PROVIDERS) result is [contentArray, artifacts].
    expect(Array.isArray(result)).toBe(true);
    const contentArr = result[0];
    expect(Array.isArray(contentArr)).toBe(true);
    expect(contentArr[0].type).toBe('text');
    expect(contentArr[0].text).toContain('"success":true');
    expect(contentArr[0].text).not.toContain('confirmationRequired');
  });

  it('user cancels → wrapper synthesizes canceled stub, never re-issues the real call', async () => {
    // Only one callTool: the initial call that returned the envelope. The
    // wrapper MUST NOT re-issue on cancel — the upstream server already
    // observed the call once when it returned the envelope.
    mockCallTool.mockResolvedValueOnce(buildEnvelopeResult(provider));

    const res = makeFakeRes();
    const tool = createToolInstance({
      res,
      toolName: 'send_chat_message',
      serverName: 'ms365',
      provider,
      toolDefinition: {
        description: 'd',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    });

    const args = { chatId: '19:x', body: 'hi' };
    const config = makeToolCallConfig({ user: { id: 'user-1' }, provider });
    const callPromise = tool.func(args, { getChild: () => undefined }, config);

    let confirmationId = null;
    for (let i = 0; i < 50 && !confirmationId; i++) {
      await new Promise((r) => setTimeout(r, 10));
      const ev = res.parseEvents().find((e) => e.event === 'mcp_confirmation_required');
      if (ev) confirmationId = ev.data.confirmationId;
    }
    expect(confirmationId).toBeTruthy();

    const app = buildApp();
    const httpRes = await request(app)
      .post(`/api/mcp/confirm/${confirmationId}`)
      .send({ decision: 'cancel' });
    expect(httpRes.status).toBe(204);

    const result = await callPromise;
    // Only the initial envelope-returning callTool. No re-issue on cancel.
    expect(mockCallTool).toHaveBeenCalledTimes(1);

    // Synthesized canceled stub — agent gets a benign result, never the envelope.
    const contentArr = result[0];
    expect(contentArr[0].text).toContain('"canceled":true');
    expect(contentArr[0].text).not.toContain('confirmationRequired');
  });

  it('TTL expiry → wrapper synthesizes canceled stub', async () => {
    // Override expiresInSeconds via a minimal envelope so we don't wait minutes.
    const envelope = JSON.stringify({
      confirmationRequired: true,
      preview: 'tiny',
      expiresInSeconds: 0.05,
    });
    mockCallTool.mockResolvedValueOnce([[{ type: 'text', text: envelope }], undefined]);

    const res = makeFakeRes();
    const tool = createToolInstance({
      res,
      toolName: 't',
      serverName: 's',
      provider,
      toolDefinition: {
        description: 'd',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    });

    const args = { x: 1 };
    const config = makeToolCallConfig({ user: { id: 'user-1' }, provider });
    const result = await tool.func(args, { getChild: () => undefined }, config);

    // Only the initial envelope-returning callTool. TTL path mirrors cancel.
    expect(mockCallTool).toHaveBeenCalledTimes(1);
    expect(result[0][0].text).toContain('"canceled":true');
    expect(result[0][0].text).toContain('did not confirm in time');
  });

  it('non-confirmation tool result passes through untouched (no regression)', async () => {
    mockCallTool.mockResolvedValueOnce(buildRealResult(provider));

    const res = makeFakeRes();
    const tool = createToolInstance({
      res,
      toolName: 't',
      serverName: 's',
      provider,
      toolDefinition: {
        description: 'd',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    });

    const args = { x: 1 };
    const config = makeToolCallConfig({ user: { id: 'user-1' }, provider });
    const result = await tool.func(args, { getChild: () => undefined }, config);

    expect(mockCallTool).toHaveBeenCalledTimes(1);
    expect(result[0][0].text).toContain('"success":true');
    // No SSE event for confirmation should have fired.
    const events = res.parseEvents();
    expect(events.find((e) => e.event === 'mcp_confirmation_required')).toBeUndefined();
  });

  it('REST endpoint rejects resolution attempts from a different user', async () => {
    const store = getConfirmationStore();
    const { confirmationId } = await store.register('user-1', 5_000);

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.__testUser = { id: 'attacker' };
      next();
    });
    app.use('/api/mcp', mcpRoutes);

    const httpRes = await request(app)
      .post(`/api/mcp/confirm/${confirmationId}`)
      .send({ decision: 'accept' });
    expect(httpRes.status).toBe(403);

    // Confirmation must still exist for the legitimate owner.
    expect(store.has(confirmationId)).toBe(true);
    store.resolve(confirmationId, 'user-1', 'cancel');
  });

  it('REST endpoint validates body and confirmationId', async () => {
    const app = buildApp();

    const bad1 = await request(app).post('/api/mcp/confirm/some-id').send({ decision: 'maybe' });
    expect(bad1.status).toBe(400);

    const bad2 = await request(app)
      .post('/api/mcp/confirm/unknown-id')
      .send({ decision: 'accept' });
    expect(bad2.status).toBe(404);
  });
});
