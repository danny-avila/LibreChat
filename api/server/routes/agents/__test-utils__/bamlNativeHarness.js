'use strict';
/**
 * Real, un-sandboxed Node process that hosts the full BAML chat-path stack for
 * Phase 5's integration tests.
 *
 * Why this exists: `packages/api/src/baml/loader.ts` crosses from CommonJS into
 * the compiled ESM BAML runtime with a deliberately non-static `import()` (the
 * documented exception to the package's no-dynamic-import rule — see the
 * comment at the top of that file). Every dynamic `import()` evaluated inside
 * Jest's CJS vm sandbox throws `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG`
 * unless Jest is launched with `--experimental-vm-modules`; that flag in turn
 * breaks `@librechat/agents`' transitive `@langchain/mistralai` dual-package
 * (CJS/ESM) resolution for every other suite that imports it — i.e. nearly the
 * whole `api` and `packages/api` test trees. Confirmed empirically: enabling
 * the flag turns `require('@librechat/agents')` itself into a hard failure
 * ("Must use import to load ES Module") before any BAML code even runs.
 *
 * `createBamlFunctions` is not separately mockable from the `api` workspace
 * either: tsdown bundles `packages/api`'s own source files (loader.ts,
 * initialize.ts, ...) into one `dist/index.cjs`, so the call from
 * `initializeBaml` to `createBamlFunctions` is an intra-bundle function call,
 * not a `require()` Jest's module registry can intercept. Every other Jest
 * spec that touches this seam (`packages/api/src/endpoints/custom/baml-initialize.spec.ts`)
 * avoids it by mocking `~/baml/loader` from *inside* `packages/api`'s own
 * source-level ts-jest suite — a boundary that only exists before bundling.
 *
 * So: this file runs the real Express app, real Mongoose models (over a real
 * `MongoMemoryServer`), the real named agents + messages routers, the real
 * `AgentClient`/`GenerationJobManager`, and the real compiled BAML dist
 * (dynamic import succeeds here because this process was never wrapped in
 * Jest's vm) in an ordinary `node` process, launched via `child_process.fork`.
 * The Jest-side spec (`../bamlChat.spec.js`) only sends commands and asserts
 * on the structured results — none of the sensitive code ever runs inside
 * Jest's sandbox, so the vm limitation never applies.
 *
 * The two external seams (matching the file header of `bamlChat.spec.js`):
 *   1. `~/server/services/Config/app`'s `getAppConfig` — replaced with a
 *      function returning this process's current test `AppConfig` directly,
 *      instead of round-tripping through a YAML file + DB overrides + Redis.
 *      `configMiddleware`, `getEndpointsConfig`, and `loadConfigModels` all
 *      read `req.config` when present (see `packages/api/src/endpoints/config/models.ts:63`)
 *      or fall back to this function — same real discovery/authorization code
 *      either way.
 *   2. The BAML provider itself — a loopback OpenAI-wire HTTP fixture wired
 *      through the same `BAML_OPENROUTER_BASE_URL`/`OPENROUTER_API_KEY`
 *      variables production points at OpenRouter (mirrors
 *      `packages/api/src/baml/runtime.acceptance.mjs`).
 *
 * Everything else — `buildEndpointOption`, exact selected-model authorization,
 * the compiled dist BAML runtime/worker, `ChatBAML`, the controller,
 * `GenerationJobManager`, Mongoose message/conversation models, and SSE
 * framing — is the real production code, unmodified.
 */
const path = require('path');
const http = require('http');
const jwt = require('jsonwebtoken');
const passport = require('passport');

const API_ROOT = path.resolve(__dirname, '../../../..');
require('module-alias')({ base: API_ROOT });

process.env.JWT_SECRET = process.env.JWT_SECRET || 'baml-phase5-harness-secret';
process.env.CREDS_KEY = process.env.CREDS_KEY || '0123456789abcdef0123456789abcdef';
process.env.CREDS_IV = process.env.CREDS_IV || '0123456789abcdef';

/** External seam #1 (see file header). Must be installed before anything else
 * requires the real module — CJS `require()` returns the same cached exports
 * object to every caller, so this must win the race to populate the cache. */
let currentAppConfig = { endpoints: {}, interfaceConfig: {} };
const configAppPath = require.resolve('~/server/services/Config/app');
require.cache[configAppPath] = {
  id: configAppPath,
  filename: configAppPath,
  loaded: true,
  exports: {
    getAppConfig: async () => currentAppConfig,
    clearAppConfigCache: async () => {},
    invalidateConfigCaches: async () => {},
  },
};

const librechatApi = require('@librechat/api');
// Concurrency limiter is Redis infrastructure unrelated to the BAML connector span.
librechatApi.checkAndIncrementPendingRequest = async () => ({ allowed: true });
librechatApi.decrementPendingRequest = async () => {};

const mcpContextPath = require.resolve('~/server/services/MCPRequestContext');
require.cache[mcpContextPath] = {
  id: mcpContextPath,
  filename: mcpContextPath,
  loaded: true,
  exports: {
    getMCPRequestContext: () => null,
    cleanupMCPRequestContextForReq: async () => {},
  },
};

/**
 * Every runtime key/value that must never cross into a persistence write, an
 * SSE frame, or a message/conversation document (Behavior 5.3). Checked on
 * the RAW object, before it crosses IPC back to the Jest process — functions
 * and symbols are silently dropped by `process.send`'s structured clone, so a
 * leak is only observable from inside this process.
 */
const FORBIDDEN_RUNTIME_KEYS = new Set([
  'functions',
  'runtimeOptions',
  'client',
  'createClient',
  'registry',
  'context',
  'signal',
  'declaredTools',
]);

function findRuntimeLeak(value, pathLabel, seen) {
  if (value == null) {
    return null;
  }
  if (typeof value === 'function') {
    return `${pathLabel} is a function`;
  }
  if (typeof value === 'symbol') {
    return `${pathLabel} is a symbol`;
  }
  if (typeof value !== 'object') {
    return null;
  }
  if (seen.has(value)) {
    return null;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      const hit = findRuntimeLeak(value[index], `${pathLabel}[${index}]`, seen);
      if (hit) {
        return hit;
      }
    }
    return null;
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === 'symbol') {
      return `${pathLabel} has symbol key ${String(key)}`;
    }
    const keyValue = value[key];
    const keyValueIsPrimitive =
      keyValue == null ||
      typeof keyValue === 'string' ||
      typeof keyValue === 'number' ||
      typeof keyValue === 'boolean';
    // A forbidden NAME is only a leak when its value isn't a harmless
    // primitive — `saveMessage`'s `{ context: 'a log label string' }` option
    // reuses the word for something unrelated to the BAML runtime carrier.
    if (FORBIDDEN_RUNTIME_KEYS.has(key) && !keyValueIsPrimitive) {
      return `${pathLabel}.${key} is a forbidden runtime key`;
    }
    const hit = findRuntimeLeak(keyValue, `${pathLabel}.${key}`, seen);
    if (hit) {
      return hit;
    }
  }
  return null;
}

/**
 * Wraps the shared `~/models` exports object BEFORE any other module (the
 * routers required below) destructures `saveMessage`/`saveConvo` into its own
 * local binding — destructuring copies the function reference, so patching
 * after that point would silently miss every real caller.
 */
const dbModels = require('~/models');
const writeViolations = [];
const originalSaveMessage = dbModels.saveMessage;
dbModels.saveMessage = async (...args) => {
  const hit = findRuntimeLeak(args, 'saveMessage.args', new Set());
  if (hit) {
    writeViolations.push(hit);
  }
  return originalSaveMessage(...args);
};
const originalSaveConvo = dbModels.saveConvo;
dbModels.saveConvo = async (...args) => {
  const hit = findRuntimeLeak(args, 'saveConvo.args', new Set());
  if (hit) {
    writeViolations.push(hit);
  }
  return originalSaveConvo(...args);
};

const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createModels } = require('@librechat/data-schemas');
const { GenerationJobManager, createStreamServices } = require('@librechat/api');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const jwtLogin = require('~/strategies/jwtStrategy');
const agentsRouter = require('~/server/routes/agents');
const messagesRouter = require('~/server/routes/messages');
// Real production bootstrap step for a zero-configured-server MCPManager
// singleton (api/server/index.js calls this at startup). `loadAgentTools`
// unconditionally reaches the singleton even for a tool-less ephemeral agent;
// without this it throws "MCPManager has not been initialized."
const initializeMCPs = require('~/server/services/initializeMCPs');

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

let mongoServer;
let User;
let server;
let baseUrl;
let provider;

/** External seam #2 (see file header). An OpenAI-wire loopback fixture,
 * adapted from `packages/api/src/baml/runtime.acceptance.mjs`. */
function createLoopbackProvider() {
  const requests = [];
  let scenario = { kind: 'answer', reply: 'Paris is sunny.' };

  const readBody = (req) =>
    new Promise((resolve, reject) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => resolve(raw));
      req.on('error', reject);
    });

  const sendJson = (res, status, payload) => {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
    });
    res.end(body);
  };

  const completion = (content) => ({
    id: 'chatcmpl-fixture',
    object: 'chat.completion',
    created: 0,
    model: 'fixture',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
  });

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const sendSse = async (res, content, pieceDelayMs) => {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    const pieces = [];
    for (let i = 0; i < content.length; i += 12) {
      pieces.push(content.slice(i, i + 12));
    }
    for (const piece of pieces) {
      res.write(
        `data: ${JSON.stringify({
          id: 'chatcmpl-fixture',
          object: 'chat.completion.chunk',
          created: 0,
          model: 'fixture',
          choices: [{ index: 0, delta: { content: piece }, finish_reason: null }],
        })}\n\n`,
      );
      if (pieceDelayMs > 0) {
        await sleep(pieceDelayMs);
      }
    }
    res.write(
      `data: ${JSON.stringify({
        id: 'chatcmpl-fixture',
        object: 'chat.completion.chunk',
        created: 0,
        model: 'fixture',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      })}\n\n`,
    );
    res.write('data: [DONE]\n\n');
    res.end();
  };

  const httpServer = http.createServer((req, res) => {
    void (async () => {
      const raw = await readBody(req);
      let body = {};
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        body = {};
      }
      const prompt = (body.messages ?? [])
        .flatMap((message) =>
          Array.isArray(message.content)
            ? message.content.map((part) => part.text ?? '')
            : [message.content ?? ''],
        )
        .join('\n');
      requests.push({ url: req.url, model: body.model, stream: body.stream === true, prompt });

      if (scenario.kind === 'error') {
        sendJson(res, scenario.status, { error: { message: 'fixture failure' } });
        return;
      }
      if (scenario.kind === 'hang') {
        // Never respond — used to drive real abort/cancellation behavior.
        return;
      }

      const content = JSON.stringify({ reply: scenario.reply, tools: [] });
      if (body.stream === true) {
        await sendSse(res, content, scenario.pieceDelayMs ?? 0);
        return;
      }
      sendJson(res, 200, completion(content));
    })();
  });

  return {
    requests,
    listen: () =>
      new Promise((resolve) => {
        httpServer.listen(0, '127.0.0.1', () =>
          resolve(`http://127.0.0.1:${httpServer.address().port}/v1`),
        );
      }),
    close: () => new Promise((resolve) => httpServer.close(() => resolve())),
    set: (next) => {
      scenario = next;
    },
    reset: () => {
      requests.length = 0;
    },
  };
}

function httpJson(method, urlPath, { token, body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : undefined;
    const req = http.request(
      `${baseUrl}${urlPath}`,
      {
        method,
        headers: {
          'content-type': 'application/json',
          'user-agent': BROWSER_USER_AGENT,
          ...(token && { authorization: `Bearer ${token}` }),
          ...(data && { 'content-length': Buffer.byteLength(data) }),
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let parsed = raw;
          try {
            parsed = JSON.parse(raw);
          } catch {
            /* not JSON */
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed, text: raw });
        });
      },
    );
    req.on('error', reject);
    if (data) {
      req.write(data);
    }
    req.end();
  });
}

/** Parses a completed SSE response body into discrete frames. */
function parseSseFrames(raw) {
  const frames = [];
  for (const part of raw.split('\n\n').filter(Boolean)) {
    const lines = part.split('\n');
    const eventLine = lines.find((line) => line.startsWith('event: '));
    const dataLine = lines.find((line) => line.startsWith('data: '));
    if (!dataLine) {
      continue;
    }
    frames.push({
      event: eventLine ? eventLine.slice('event: '.length) : undefined,
      rawFrame: part,
      data: JSON.parse(dataLine.slice('data: '.length)),
    });
  }
  return frames;
}

/** Collects a full SSE response (connects, reads until the socket closes). */
function collectSse(urlPath, token, extraHeaders) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${baseUrl}${urlPath}`,
      {
        method: 'GET',
        headers: {
          'user-agent': BROWSER_USER_AGENT,
          authorization: `Bearer ${token}`,
          ...extraHeaders,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          resolve({ status: res.statusCode, headers: res.headers, frames: parseSseFrames(raw) });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * Connects to the SSE stream and resolves as soon as `predicate` matches an
 * observed frame, then aborts the connection — used to drive a real
 * mid-stream disconnect (Behavior 5.5) without waiting for the terminal frame.
 */
function collectSseUntil(urlPath, token, predicate, { maxFrames = Infinity, extraHeaders } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${baseUrl}${urlPath}`,
      {
        method: 'GET',
        headers: {
          'user-agent': BROWSER_USER_AGENT,
          authorization: `Bearer ${token}`,
          ...extraHeaders,
        },
      },
      (res) => {
        let raw = '';
        let settled = false;
        res.on('data', (chunk) => {
          raw += chunk;
          const frames = parseSseFrames(raw);
          if (settled) {
            return;
          }
          if (frames.length >= maxFrames || frames.some(predicate)) {
            settled = true;
            req.destroy();
            resolve({ frames });
          }
        });
        res.on('end', () => {
          if (!settled) {
            settled = true;
            resolve({ frames: parseSseFrames(raw) });
          }
        });
        res.on('error', () => {
          if (!settled) {
            settled = true;
            resolve({ frames: parseSseFrames(raw) });
          }
        });
      },
    );
    req.on('error', (error) => {
      if (error.code !== 'ECONNRESET') {
        reject(error);
      }
    });
    req.end();
  });
}

async function handleCommand(cmd) {
  switch (cmd.type) {
    case 'init': {
      mongoServer = await MongoMemoryServer.create();
      await mongoose.connect(mongoServer.getUri());
      const models = createModels(mongoose);
      User = models.User;
      passport.use('jwt', jwtLogin());

      provider = createLoopbackProvider();
      const providerBaseUrl = await provider.listen();
      // Set BEFORE any BAML call: the compiled clients / single-use worker
      // read these at call time, and production points the same variable at
      // OpenRouter.
      process.env.BAML_OPENROUTER_BASE_URL = providerBaseUrl;
      process.env.OPENROUTER_API_KEY = 'fixture-key';

      GenerationJobManager.configure({ ...createStreamServices(), cleanupOnComplete: false });
      GenerationJobManager.initialize();
      await initializeMCPs();

      const app = express();
      app.use(express.json());
      app.use(requireJwtAuth);
      app.use('/api/agents', agentsRouter);
      app.use('/api/messages', messagesRouter);
      server = http.createServer(app);
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      return { ok: true };
    }
    case 'shutdown': {
      // Best-effort, individually bounded: an SSE test that destroys its own
      // client socket (Behavior 5.5) can leave the server-side connection in
      // a state `server.close()`'s callback waits on indefinitely — one stuck
      // step must not strand the others, and this process must exit either way.
      const withTimeout = (label, promise, ms = 3000) =>
        Promise.race([
          promise,
          new Promise((resolve) =>
            setTimeout(() => {
              process.stderr.write(`[bamlNativeHarness] shutdown step "${label}" timed out\n`);
              resolve(undefined);
            }, ms),
          ),
        ]).catch((error) => {
          process.stderr.write(`[bamlNativeHarness] shutdown step "${label}" failed: ${error}\n`);
        });
      await withTimeout('GenerationJobManager.destroy', GenerationJobManager.destroy());
      await withTimeout('provider.close', provider?.close() ?? Promise.resolve());
      server.closeAllConnections?.();
      await withTimeout('server.close', new Promise((resolve) => server.close(resolve)));
      await withTimeout('mongoose.disconnect', mongoose.disconnect());
      await withTimeout('mongoServer.stop', mongoServer.stop());
      // Self-terminate rather than relying on the parent's `child.kill()`
      // reaching us: after this response, no command can un-hang us anyway.
      setTimeout(() => process.exit(0), 50);
      return { ok: true };
    }
    case 'setConfig': {
      currentAppConfig = cmd.appConfig;
      writeViolations.length = 0;
      return { ok: true };
    }
    case 'getWriteViolations': {
      return { ok: true, violations: [...writeViolations] };
    }
    case 'getResumeStateLeak': {
      const resumeState = await GenerationJobManager.getResumeState(cmd.streamId);
      const hit = findRuntimeLeak(resumeState, 'resumeState', new Set());
      return { ok: true, violation: hit };
    }
    case 'providerSet': {
      provider.set(cmd.scenario);
      return { ok: true };
    }
    case 'providerReset': {
      provider.reset();
      return { ok: true };
    }
    case 'providerRequests': {
      return { ok: true, requests: provider.requests };
    }
    case 'createUser': {
      const doc = await User.create({
        name: cmd.name ?? 'BAML Test User',
        username: cmd.email.split('@')[0],
        email: cmd.email,
        emailVerified: true,
        provider: 'local',
        role: 'USER',
      });
      const token = jwt.sign({ id: doc._id.toString() }, process.env.JWT_SECRET);
      return { ok: true, userId: doc._id.toString(), token };
    }
    case 'signBogusToken': {
      // A well-formed, correctly-signed JWT for a user id with no matching
      // document. `jwtStrategy`'s verify callback resolves no user and passes
      // no `info`, so `requireJwtAuth`'s fallback produces exactly
      // `{ message: 'Unauthorized' }` — the plan's exact locked-decision body.
      const token = jwt.sign(
        { id: new mongoose.Types.ObjectId().toString() },
        process.env.JWT_SECRET,
      );
      return { ok: true, token };
    }
    case 'httpPost': {
      const res = await httpJson('POST', cmd.path, {
        token: cmd.token,
        body: cmd.body,
        headers: cmd.headers,
      });
      return { ok: true, res };
    }
    case 'httpGet': {
      const res = await httpJson('GET', cmd.path, { token: cmd.token, headers: cmd.headers });
      return { ok: true, res };
    }
    case 'sse': {
      const res = await collectSse(cmd.path, cmd.token, cmd.headers);
      return { ok: true, res };
    }
    case 'sseUntilFrames': {
      const res = await collectSseUntil(
        cmd.path,
        cmd.token,
        (frame) => frame.data?.[cmd.matchKey],
        {
          maxFrames: cmd.maxFrames,
          extraHeaders: cmd.headers,
        },
      );
      return { ok: true, res };
    }
    case 'getJob': {
      const job = await GenerationJobManager.getJob(cmd.streamId);
      return {
        ok: true,
        job: job
          ? {
              status: job.status,
              createdAt: job.createdAt,
              metadata: { userId: job.metadata?.userId },
            }
          : null,
      };
    }
    default:
      return { ok: false, error: `Unknown command "${cmd.type}"` };
  }
}

process.on('message', async (msg) => {
  try {
    const result = await handleCommand(msg);
    process.send({ id: msg.id, ...result });
  } catch (error) {
    process.send({ id: msg.id, ok: false, error: error?.stack ?? String(error) });
  }
});
