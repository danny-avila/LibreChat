/**
 * Phase 5 — the authenticated public route (issue AF-4v8), Closures C, D, E.
 *
 * The real stack (Express app with the real named agents + messages routers,
 * `MongoMemoryServer`-backed Mongoose models, real JWT auth via the real `jwt`
 * passport strategy, `GenerationJobManager`, and the compiled BAML dist) runs in
 * `../__test-utils__/bamlNativeHarness.js`, a plain `node` child process launched via
 * `child_process.fork`. See that file's header for why: `packages/api`'s
 * lazy-loader crosses into the compiled ESM BAML runtime with a dynamic
 * `import()`, and every dynamic `import()` evaluated inside Jest's CJS vm
 * sandbox throws `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG` unless Jest runs
 * with `--experimental-vm-modules` — a flag that itself breaks
 * `@librechat/agents`' transitive `@mistralai/mistralai` resolution for every
 * other suite in this workspace. Running the real stack outside Jest's sandbox
 * and driving it over IPC keeps every part of "the changed connector span" —
 * `buildEndpointOption`, exact selected-model authorization, the compiled dist
 * BAML runtime/worker, `ChatBAML`, the controller, `GenerationJobManager`,
 * Mongoose persistence, and SSE framing — genuinely real; only the process
 * boundary between this Jest file and that code is new test scaffolding.
 *
 * The two non-"changed-connector-span" external seams (see the harness file's
 * header for the full justification):
 *   1. `getAppConfig` — the request-scoped `AppConfig` is supplied directly
 *      instead of round-tripped through a YAML file + DB overrides + Redis.
 *   2. The BAML provider itself — a loopback OpenAI-wire HTTP fixture wired
 *      through the same `BAML_OPENROUTER_BASE_URL`/`OPENROUTER_API_KEY`
 *      variables production points at OpenRouter.
 *
 * Behavior 5.1b runs separately, directly in this Jest process (no harness):
 * it is explicitly a port-contract integration against a deterministic
 * `BamlFunctionSet`, not the native-runtime oracle (see the plan's Behavior
 * 5.1b), so it never needs the dynamic-import boundary above.
 */

const path = require('path');
const { fork } = require('child_process');
const { EModelEndpoint, Providers, Constants } = require('librechat-data-provider');

const BAML_ENDPOINT = 'Team-BAML';
const COMPILED_CLIENT = 'OpenRouter';
const UNCOMPILED_CLIENT = 'NotCompiled';
const UNCOMPILED_ERROR_TEXT =
  'An error occurred while processing the request: BAML turn failed (model_error): The selected BAML model is not compiled for this server.';

const HARNESS_PATH = path.join(__dirname, '..', '__test-utils__', 'bamlNativeHarness.js');

/** Thin IPC client for the harness child process (see file header). */
class Harness {
  constructor() {
    this.child = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  start() {
    this.child = fork(HARNESS_PATH, [], { stdio: ['pipe', 'pipe', 'inherit', 'ipc'] });
    this.child.on('message', (msg) => {
      const entry = this.pending.get(msg.id);
      if (!entry) {
        return;
      }
      this.pending.delete(msg.id);
      if (msg.ok) {
        entry.resolve(msg);
      } else {
        entry.reject(new Error(msg.error ?? 'harness command failed'));
      }
    });
    this.child.on('exit', (code, signal) => {
      for (const entry of this.pending.values()) {
        entry.reject(new Error(`harness exited (code=${code}, signal=${signal}) mid-command`));
      }
      this.pending.clear();
    });
  }

  send(cmd) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.child.send({ ...cmd, id });
    });
  }

  async stop() {
    if (!this.child) {
      return;
    }
    const child = this.child;
    // The harness self-exits after `shutdown` (see its file for why a bounded
    // per-step timeout there still isn't enough on its own); race it against
    // a hard deadline here too, so a wedged child is never left running.
    await Promise.race([
      this.send({ type: 'shutdown' }).catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (child.exitCode == null && child.signalCode == null) {
      child.kill('SIGKILL');
    }
  }
}

function bamlAppConfig({
  models = [COMPILED_CLIENT, UNCOMPILED_CLIENT],
  name = BAML_ENDPOINT,
} = {}) {
  return {
    endpoints: {
      custom: [
        {
          name,
          provider: Providers.BAML,
          models: { default: models, fetch: false },
          tokenConfig: {
            [COMPILED_CLIENT]: { context: 131072, prompt: 0.03, completion: 0.17 },
          },
        },
      ],
    },
    interfaceConfig: {},
  };
}

function chatBody(overrides = {}) {
  return {
    text: 'weather in Paris?',
    endpoint: BAML_ENDPOINT,
    endpointType: EModelEndpoint.custom,
    model: COMPILED_CLIENT,
    conversationId: 'new',
    parentMessageId: Constants.NO_PARENT,
    isContinued: false,
    isTemporary: false,
    ...overrides,
  };
}

const protocolHeaders = { 'x-librechat-generation-protocol': '2' };

describe('BAML public chat route (Closures C, D, E)', () => {
  jest.setTimeout(60000);

  /** @type {Harness} */
  let harness;

  beforeAll(async () => {
    harness = new Harness();
    harness.start();
    await harness.send({ type: 'init' });
  }, 60000);

  afterAll(async () => {
    await harness.stop();
  });

  beforeEach(async () => {
    await harness.send({ type: 'setConfig', appConfig: bamlAppConfig() });
    await harness.send({ type: 'providerReset' });
    await harness.send({
      type: 'providerSet',
      scenario: { kind: 'answer', reply: 'Paris is sunny and 21 degrees.' },
    });
  });

  async function createUser(email) {
    const res = await harness.send({ type: 'createUser', email });
    return { userId: res.userId, token: res.token };
  }

  async function post(token, body) {
    const { res } = await harness.send({
      type: 'httpPost',
      path: `/api/agents/chat/${encodeURIComponent(BAML_ENDPOINT)}`,
      token,
      headers: protocolHeaders,
      body,
    });
    return res;
  }

  async function waitForJobSettled(streamId, { timeoutMs = 20000, intervalMs = 100 } = {}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const { job } = await harness.send({ type: 'getJob', streamId });
      if (!job || job.status !== 'running') {
        return job;
      }
      if (Date.now() > deadline) {
        throw new Error(
          `job ${streamId} did not settle within ${timeoutMs}ms (last status: running)`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  async function collectSse(token, streamId, headers = protocolHeaders) {
    const { res } = await harness.send({
      type: 'sse',
      path: `/api/agents/chat/stream/${streamId}`,
      token,
      headers,
    });
    return res;
  }

  async function getMessages(token, conversationId) {
    const { res } = await harness.send({
      type: 'httpGet',
      path: `/api/messages/${conversationId}`,
      token,
    });
    return res;
  }

  /** Every runtime key/value that must never appear on a public observable. */
  const FORBIDDEN_KEYS = new Set([
    'functions',
    'runtimeOptions',
    'client',
    'createClient',
    'registry',
    'context',
    'signal',
    'declaredTools',
  ]);
  const FORBIDDEN_SUBSTRINGS = [
    'baml_src',
    'baml.toml',
    '/dist/baml',
    'worker.mjs',
    'BamlCallContext',
    'BAML_OPENROUTER_BASE_URL',
    'OPENROUTER_API_KEY',
    'node_modules',
    ' at ', // stack-trace frame marker
  ];

  /** Recursively walks a JSON-shaped value looking for forbidden runtime state. */
  function assertNoRuntimeLeak(value, pathLabel = '$') {
    if (value == null) {
      return;
    }
    if (typeof value === 'string') {
      for (const needle of FORBIDDEN_SUBSTRINGS) {
        expect(value.includes(needle)).toBe(false);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertNoRuntimeLeak(item, `${pathLabel}[${index}]`));
      return;
    }
    if (typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        expect(FORBIDDEN_KEYS.has(key)).toBe(false);
        assertNoRuntimeLeak(item, `${pathLabel}.${key}`);
      }
    }
  }

  test('Behavior 5.1: authenticated success chain — ordered text, one final message, exact identity, durable persistence', async () => {
    const { token } = await createUser('owner-5-1@example.com');

    const startRes = await post(token, chatBody());

    expect(startRes.status).toBe(200);
    expect(startRes.headers['x-librechat-generation-protocol']).toBe('2');
    expect(Object.keys(startRes.body).sort()).toEqual(
      [
        'conversationId',
        'generationCreatedAt',
        'generationProtocolVersion',
        'status',
        'streamId',
      ].sort(),
    );
    expect(startRes.body.status).toBe('started');
    expect(startRes.body.generationProtocolVersion).toBe(2);
    expect(typeof startRes.body.streamId).toBe('string');
    expect(typeof startRes.body.conversationId).toBe('string');
    expect(typeof startRes.body.generationCreatedAt).toBe('number');

    const { streamId, conversationId } = startRes.body;
    const settledJob = await waitForJobSettled(streamId);
    expect(settledJob?.status).toBe('complete');

    const sse = await collectSse(token, streamId);
    expect(sse.status).toBe(200);
    expect(sse.headers['content-type']).toContain('text/event-stream');
    expect(sse.headers['cache-control']).toBe('no-cache, no-transform');
    expect(sse.headers['content-encoding']).toBe('identity');
    expect(sse.headers['connection']).toBe('keep-alive');
    expect(sse.headers['x-accel-buffering']).toBe('no');
    expect(sse.headers['x-librechat-generation-protocol']).toBe('2');
    expect(sse.frames.length).toBeGreaterThan(0);

    for (const frame of sse.frames) {
      expect(frame.event).toBe('message');
    }

    const finalFrame = sse.frames[sse.frames.length - 1];
    expect(finalFrame.data.final).toBe(true);

    // Zero native BAML usage events: the native adapter case omits `meta`
    // (see the plan's locked decision #6), so no `on_token_usage` frame exists.
    const usageEvents = sse.frames.filter((frame) => frame.data?.event === 'on_token_usage');
    expect(usageEvents).toHaveLength(0);

    const messageDeltaEvents = sse.frames.filter(
      (frame) => frame.data?.event === 'on_message_delta',
    );
    expect(messageDeltaEvents.length).toBeGreaterThan(0);
    const orderedText = messageDeltaEvents
      .flatMap((frame) => frame.data?.data?.delta?.content ?? [])
      .filter((part) => part?.type === 'text')
      .map((part) => part.text)
      .join('');
    expect(orderedText).toBe('Paris is sunny and 21 degrees.');

    assertNoRuntimeLeak(sse.frames);

    const messagesRes = await getMessages(token, conversationId);
    expect(messagesRes.status).toBe(200);
    assertNoRuntimeLeak(messagesRes.body);

    const assistantMessages = messagesRes.body.filter((message) => !message.isCreatedByUser);
    expect(assistantMessages).toHaveLength(1);
    const assistantMessage = assistantMessages[0];
    expect(assistantMessage.endpoint).toBe(BAML_ENDPOINT);
    expect(assistantMessage.model).toBe(COMPILED_CLIENT);
    expect(assistantMessage.unfinished).toBe(false);
    expect(assistantMessage.error).toBe(false);
    // Agent-endpoint messages are authoritative through `content`, not the
    // legacy top-level `text` field (left empty for multi-part content).
    expect(assistantMessage.content).toEqual([
      { type: 'text', text: 'Paris is sunny and 21 degrees.' },
    ]);
    expect(typeof assistantMessage.tokenCount).toBe('number');
    expect(assistantMessage.tokenCount).toBeGreaterThan(0);

    const { requests } = await harness.send({ type: 'providerRequests' });
    expect(requests).toHaveLength(1);
    expect(requests[0].model).toBe('openai/gpt-oss-120b');

    // Behavior 5.3 — the write arguments actually handed to `saveMessage`/
    // `saveConvo`, and the generation's pending/resume state, never carry a
    // function, a symbol, or a forbidden runtime key. Checked on the raw
    // object inside the harness process (see its file header): a leak here
    // would be silently dropped by IPC's structured clone, invisible to any
    // check performed after crossing back to this Jest process.
    const { violations } = await harness.send({ type: 'getWriteViolations' });
    expect(violations).toEqual([]);
    const { violation: resumeStateViolation } = await harness.send({
      type: 'getResumeStateLeak',
      streamId,
    });
    expect(resumeStateViolation).toBeNull();
  });

  test('Behavior 5.1 authorization: another user cannot read the stream or the messages', async () => {
    const owner = await createUser('owner-5-1-auth@example.com');
    const intruder = await createUser('intruder-5-1-auth@example.com');

    const startRes = await post(owner.token, chatBody());
    expect(startRes.status).toBe(200);
    const { streamId, conversationId } = startRes.body;
    await waitForJobSettled(streamId);

    const { res: streamRes } = await harness.send({
      type: 'httpGet',
      path: `/api/agents/chat/stream/${streamId}`,
      token: intruder.token,
    });
    expect(streamRes.status).toBe(403);

    // Real, existing security behavior (packages/api/src/middleware/messageValidation.ts):
    // a conversation that does not belong to the requester reads as absent, not
    // as an authorized-but-empty list — it must not confirm the conversation exists.
    const { res: messagesRes } = await harness.send({
      type: 'httpGet',
      path: `/api/messages/${conversationId}`,
      token: intruder.token,
    });
    expect(messagesRes.status).toBe(404);
    expect(messagesRes.body).toEqual({ error: 'Conversation not found' });
  });

  test('an unauthenticated POST is rejected with 401', async () => {
    // A well-formed JWT for a user that does not exist: `jwtStrategy` resolves
    // no user and passes no `info`, so `requireJwtAuth`'s fallback produces the
    // exact locked-decision body. A request with NO Authorization header at all
    // fails one strategy step earlier, inside passport-jwt's own extractor, with
    // its own message ("No auth token") — a different, real, but less precise
    // failure than the one the plan's JWT harness contract names.
    const { token: bogusToken } = await harness.send({ type: 'signBogusToken' });
    const { res } = await harness.send({
      type: 'httpPost',
      path: `/api/agents/chat/${encodeURIComponent(BAML_ENDPOINT)}`,
      token: bogusToken,
      headers: protocolHeaders,
      body: chatBody(),
    });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Unauthorized' });
  });

  test('Behavior 5.2: allow-listed but uncompiled client persists one safe error, no provider request', async () => {
    const { token } = await createUser('owner-5-2@example.com');

    const startRes = await post(token, chatBody({ model: UNCOMPILED_CLIENT }));
    expect(startRes.status).toBe(200);
    const { streamId, conversationId } = startRes.body;

    const settledJob = await waitForJobSettled(streamId);
    expect(settledJob?.status).toBe('complete');

    const sse = await collectSse(token, streamId);
    for (const frame of sse.frames) {
      expect(frame.event).toBe('message');
    }
    const finalFrame = sse.frames[sse.frames.length - 1];
    expect(finalFrame.data.final).toBe(true);
    assertNoRuntimeLeak(sse.frames);

    const messagesRes = await getMessages(token, conversationId);
    const assistantMessages = messagesRes.body.filter((message) => !message.isCreatedByUser);
    expect(assistantMessages).toHaveLength(1);
    const assistantMessage = assistantMessages[0];
    // The plan's own contract: a BAML failure becomes an ORDINARY final message
    // carrying a `ContentTypes.ERROR` content part — not a message-level error flag.
    expect(assistantMessage.content).toEqual([{ type: 'error', error: UNCOMPILED_ERROR_TEXT }]);
    expect(assistantMessage.unfinished).toBe(false);
    assertNoRuntimeLeak(assistantMessage);

    const { requests } = await harness.send({ type: 'providerRequests' });
    expect(requests).toHaveLength(0);
  });

  test('Behavior 5.4: owner abort has one terminal outcome and no duplicate persistence', async () => {
    const { token } = await createUser('owner-5-4@example.com');
    // The provider never responds, so the call is still in flight when the
    // abort request lands — a real pending-pull cancellation, not a race with
    // natural completion.
    await harness.send({ type: 'providerSet', scenario: { kind: 'hang' } });

    const startRes = await post(token, chatBody());
    expect(startRes.status).toBe(200);
    const { streamId, conversationId } = startRes.body;

    // Give the async startGeneration tail a moment to actually reach the BAML
    // call (and the loopback fixture) before aborting it.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const { job: runningJob } = await harness.send({ type: 'getJob', streamId });
    expect(runningJob?.status).toBe('running');

    const { res: abortRes } = await harness.send({
      type: 'httpPost',
      path: '/api/agents/chat/abort',
      token,
      headers: protocolHeaders,
      body: { conversationId: streamId },
    });
    expect(abortRes.status).toBe(200);
    expect(abortRes.body.success).toBe(true);

    const settledJob = await waitForJobSettled(streamId);
    expect(settledJob?.status).toBe('aborted');

    const messagesRes = await getMessages(token, conversationId);
    const userMessages = messagesRes.body.filter((message) => message.isCreatedByUser);
    const assistantMessages = messagesRes.body.filter((message) => !message.isCreatedByUser);
    expect(userMessages.length).toBeLessThanOrEqual(1);
    expect(assistantMessages.length).toBeLessThanOrEqual(1);
    assertNoRuntimeLeak(messagesRes.body);

    // Nothing further arrives once the abort has settled.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const messagesResAgain = await getMessages(token, conversationId);
    expect(messagesResAgain.body).toEqual(messagesRes.body);

    const { requests } = await harness.send({ type: 'providerRequests' });
    expect(requests.length).toBeLessThanOrEqual(1);
  });

  test('Behavior 5.5: SSE disconnect without the abort route only unsubscribes; reconnect replays without duplication', async () => {
    const { token } = await createUser('owner-5-5@example.com');
    await harness.send({
      type: 'providerSet',
      scenario: { kind: 'answer', reply: 'Paris is cool and breezy.', pieceDelayMs: 150 },
    });

    const startRes = await post(token, chatBody());
    expect(startRes.status).toBe(200);
    const { streamId, conversationId } = startRes.body;

    // Connect, observe the `created` frame, then disconnect WITHOUT calling
    // the abort route — a real client navigating away / losing network.
    const { res: firstConnect } = await harness.send({
      type: 'sseUntilFrames',
      path: `/api/agents/chat/stream/${streamId}`,
      token,
      matchKey: 'created',
      headers: protocolHeaders,
    });
    expect(firstConnect.frames.length).toBeGreaterThan(0);
    expect(firstConnect.frames[0].data.created).toBe(true);

    // Generation is NOT aborted by the disconnect — it keeps running and settles.
    const settledJob = await waitForJobSettled(streamId, { timeoutMs: 20000 });
    expect(settledJob?.status).toBe('complete');

    // A plain fresh subscribe (not `?resume=true`, which is the delta-resume
    // path for a client with a partial view) — the manager retains the full
    // chunk log for an already-terminal job (`cleanupOnComplete: false`), so
    // a brand-new subscribe replays it in full, exactly as Behavior 5.1's own
    // post-completion SSE fetch already proves.
    const reconnect = await collectSse(token, streamId);
    expect(reconnect.status).toBe(200);
    for (const frame of reconnect.frames) {
      expect(frame.event).toBe('message');
    }
    const finalFrame = reconnect.frames[reconnect.frames.length - 1];
    expect(finalFrame.data.final).toBe(true);

    // No duplication: the reply text appears exactly once across the replay.
    const messageDeltaEvents = reconnect.frames.filter(
      (frame) => frame.data?.event === 'on_message_delta',
    );
    const orderedText = messageDeltaEvents
      .flatMap((frame) => frame.data?.data?.delta?.content ?? [])
      .filter((part) => part?.type === 'text')
      .map((part) => part.text)
      .join('');
    expect(orderedText).toBe('Paris is cool and breezy.');
    const createdFrames = reconnect.frames.filter((frame) => frame.data?.created === true);
    expect(createdFrames.length).toBeLessThanOrEqual(1);

    // The durable response is singular.
    const messagesRes = await getMessages(token, conversationId);
    const assistantMessages = messagesRes.body.filter((message) => !message.isCreatedByUser);
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0].content).toEqual([
      { type: 'text', text: 'Paris is cool and breezy.' },
    ]);
  });
});

/**
 * Behavior 5.1b — complete public port metadata emits once.
 *
 * A port-contract integration, not the native-runtime oracle (see the plan's
 * own text for this behavior): drives a deterministic `BamlFunctionSet`
 * directly through the real `ChatBAML`, the real `@librechat/agents` `Run`,
 * and the real usage/cost callback pipeline (mirrors
 * `api/server/controllers/agents/__tests__/usageEvents.integration.spec.js`).
 * Never touches the compiled BAML runtime, so it runs in this Jest process —
 * no harness, no dynamic-import boundary.
 */
describe('Behavior 5.1b — complete public port metadata emits once', () => {
  const { HumanMessage } = require('@langchain/core/messages');
  const { Run, Providers, createContentAggregator } = require('@librechat/agents');
  const { getDefaultHandlers } = require('~/server/controllers/agents/callbacks');

  const charCounter = (msg) => {
    const content = msg.content;
    return typeof content === 'string' ? content.length : 3;
  };

  function createMockRes() {
    const events = [];
    return {
      events,
      headersSent: true,
      writableEnded: false,
      write(payload) {
        for (const line of String(payload).split('\n')) {
          if (line.startsWith('data: ')) {
            events.push(JSON.parse(line.slice(6)));
          }
        }
        return true;
      },
    };
  }

  /** A real implementation of the BAML port (not a mock of BAML): the final
   * chunk carries both input and output counts; the first carries only one. */
  function createDeterministicBamlFunctionSet() {
    return {
      version: 1,
      declaredTools: [],
      async takeTurn() {
        throw new Error('unused in this test');
      },
      streamTurn() {
        return (async function* () {
          // Partial count pair — must be discarded, no usage_metadata attached.
          yield { kind: 'text', text: 'Hello ', meta: { inputTokens: 999 } };
          // Complete pair on the final chunk.
          yield {
            kind: 'text',
            text: 'world',
            meta: { model: COMPILED_CLIENT, inputTokens: 11, outputTokens: 5 },
          };
        })();
      },
    };
  }

  test('exactly one on_token_usage with exact counts, client, and cost; a partial pair is discarded', async () => {
    const res = createMockRes();
    const { contentParts, aggregateContent } = createContentAggregator();
    const usageEmitSink = [];
    const collectedUsage = [];
    const endpointTokenConfig = {
      [COMPILED_CLIENT]: { prompt: 0.03, completion: 0.17, context: 131072 },
    };
    const usageCost = {
      enabled: true,
      endpointTokenConfig,
      pricing: {
        getMultiplier: ({ tokenType, model, endpointTokenConfig: cfg }) =>
          cfg?.[model]?.[tokenType] ?? 0,
        getCacheMultiplier: () => 0,
      },
    };
    const handlers = getDefaultHandlers({
      res,
      aggregateContent,
      toolEndCallback: () => {},
      collectedUsage,
      usageEmitSink,
      usageCost,
    });

    const functions = createDeterministicBamlFunctionSet();
    const run = await Run.create({
      runId: 'baml-usage-response',
      graphConfig: {
        type: 'standard',
        llmConfig: {
          provider: Providers.BAML,
          functions,
          model: COMPILED_CLIENT,
          streaming: true,
        },
        instructions: 'You are a helpful assistant.',
      },
      returnContent: true,
      customHandlers: handlers,
      tokenCounter: charCounter,
      indexTokenCountMap: {},
    });

    await run.processStream(
      { messages: [new HumanMessage('weather in Paris?')] },
      {
        configurable: { thread_id: 'baml-usage-thread', user_id: 'user-1' },
        streamMode: 'values',
        version: 'v2',
      },
    );

    const usageEvents = res.events.filter((event) => event.event === 'on_token_usage');
    expect(usageEvents).toHaveLength(1);
    expect(usageEvents[0].data).toMatchObject({
      input_tokens: 11,
      output_tokens: 5,
      total_tokens: 16,
    });
    expect(usageEvents[0].data.model).toBe(COMPILED_CLIENT);
    expect(usageEvents[0].data.provider).toBe(Providers.BAML);
    // Token rates are quoted per-million-tokens (matches the plan's example
    // `librechat.example.yaml` `tokenConfig` and real OpenRouter pricing).
    expect(usageEvents[0].data.cost).toBeCloseTo((11 * 0.03 + 5 * 0.17) / 1_000_000, 10);

    const text = contentParts
      .filter((part) => part?.type === 'text')
      .map((part) => part.text)
      .join('');
    expect(text).toBe('Hello world');
  });
});
