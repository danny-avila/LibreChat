/**
 * Closure A — compiled runtime selection.
 *
 *   SOURCE      packages/api/baml_src static clients/functions/retry policies
 *   TRIGGER     compiled dist BAML facade resolves the exact selected client
 *   BOUNDARY    dist/baml/runtime.mjs -> worker -> generated *_async / *$stream_async
 *   DRIVER      single-use native worker, loopback fixture, real timers
 *   OBSERVABLE  fixture request model/prompt/attempts; port deltas/final/failure
 *
 * Runs against BUILT output, never source: the point is that the artifact the
 * package ships selects the right compiled client, keeps each client's compiled
 * retry policy, streams before it finalizes, and refuses an unknown name before
 * any provider request.
 *
 * Not Jest: the package's Jest transform does not handle `.mjs`, and driving the
 * real worker/native graph through it would prove less than running the shipped
 * file directly. Bounded by a watchdog so a hung native pull fails instead of
 * hanging CI.
 *
 *   node packages/api/src/baml/runtime.acceptance.mjs
 */

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../..');
const RUNTIME_URL = pathToFileURL(path.join(PACKAGE_ROOT, 'dist/baml/runtime.mjs')).href;

const WATCHDOG_MS = 180_000;
const OPENROUTER_MODEL = 'openai/gpt-oss-120b';
const OPENROUTER_FAST_MODEL = 'openai/gpt-oss-20b';
const PROTOCOL_MARKER = 'Never call a tool whose result already appears in the transcript.';
const UNCOMPILED_MESSAGE = 'The selected BAML model is not compiled for this server.';

/* ─────────────────────────────── loopback provider ─────────────────────────── */

/**
 * An OpenAI-wire fixture. The compiled clients point at it through the same
 * `BAML_OPENROUTER_BASE_URL` production uses, so the shipped functions run
 * unchanged — no fixture client is compiled into the package.
 */
const createProvider = () => {
  const requests = [];
  let scenario = { kind: 'answer', reply: 'Paris is sunny.' };

  const readBody = (req) =>
    new Promise((resolve, reject) => {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
      });
      req.on('end', () => resolve(raw));
      req.on('error', reject);
    });

  const sendJson = (res, status, payload) => {
    const body = JSON.stringify(payload);
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
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

  /** Emits the JSON answer in pieces so a partial snapshot exists before the final. */
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

  const server = createServer((req, res) => {
    void (async () => {
      const raw = await readBody(req);
      let body = {};
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        body = {};
      }
      // The openai provider sends structured content parts, not a bare string.
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
        server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}/v1`));
      }),
    close: () => new Promise((resolve) => server.close(() => resolve())),
    set: (next) => {
      scenario = next;
    },
    reset: () => {
      requests.length = 0;
    },
  };
};

/* ──────────────────────────────── tiny harness ─────────────────────────────── */

const results = [];

const check = async (name, run) => {
  try {
    await run();
    results.push({ name, ok: true });
    process.stdout.write(`  ok   ${name}\n`);
  } catch (error) {
    results.push({ name, ok: false, error });
    process.stdout.write(`  FAIL ${name}\n       ${error?.stack ?? error}\n`);
  }
};

const promptInput = (text, overrides = {}) => ({
  version: 1,
  transcript: [{ role: 'user', content: text }],
  allowedTools: [],
  ...overrides,
});

const collect = async (iterable) => {
  const chunks = [];
  for await (const chunk of iterable) {
    chunks.push(chunk);
  }
  return chunks;
};

/* ─────────────────────────────────── the run ───────────────────────────────── */

const main = async () => {
  const provider = createProvider();
  const baseUrl = await provider.listen();

  // Set BEFORE the facade loads: a worker inherits `process.env` at creation and
  // the compiled clients read these names at call time.
  process.env.BAML_OPENROUTER_BASE_URL = baseUrl;
  process.env.OPENROUTER_API_KEY = 'fixture-key';

  const { createBamlFunctionSet } = await import(RUNTIME_URL);

  const openRouter = createBamlFunctionSet({ clientName: 'OpenRouter' });
  const fast = createBamlFunctionSet({ clientName: 'OpenRouterFast' });

  /* Behavior 0.1 — two exact static clients route and retry differently. */

  await check('call on OpenRouter uses its compiled model and the shared prompt', async () => {
    provider.reset();
    provider.set({ kind: 'answer', reply: 'Paris is sunny.' });

    const result = await openRouter.takeTurn(promptInput('weather in Paris?'));

    assert.equal(result.kind, 'answer');
    assert.equal(result.text, 'Paris is sunny.');
    assert.equal(result.meta, undefined, 'meta must be absent, never fabricated');
    assert.equal(provider.requests.length, 1);
    assert.equal(provider.requests[0].model, OPENROUTER_MODEL);
    assert.ok(provider.requests[0].prompt.includes(PROTOCOL_MARKER), 'shared prompt helper missing');
    assert.ok(provider.requests[0].prompt.includes('weather in Paris?'));
  });

  await check('call on OpenRouterFast uses the OTHER compiled model, same prompt', async () => {
    provider.reset();
    provider.set({ kind: 'answer', reply: 'Fast answer.' });

    const result = await fast.takeTurn(promptInput('weather in Paris?'));

    assert.equal(result.kind, 'answer');
    assert.equal(result.text, 'Fast answer.');
    assert.equal(provider.requests.length, 1);
    assert.equal(provider.requests[0].model, OPENROUTER_FAST_MODEL);
    assert.ok(provider.requests[0].prompt.includes(PROTOCOL_MARKER));
  });

  await check('compiled retry policies differ: 5 attempts vs 3', async () => {
    provider.reset();
    provider.set({ kind: 'error', status: 500 });

    await assert.rejects(() => openRouter.takeTurn(promptInput('retry please')));
    const slowAttempts = provider.requests.length;

    provider.reset();
    await assert.rejects(() => fast.takeTurn(promptInput('retry please')));
    const fastAttempts = provider.requests.length;

    assert.equal(slowAttempts, 5, 'FreePoolBackoff max_retries 4 => 5 attempts');
    assert.equal(fastAttempts, 3, 'FastPoolBackoff max_retries 2 => 3 attempts');
  });

  await check('a provider failure rejects as a sanitized transport error', async () => {
    provider.reset();
    provider.set({ kind: 'error', status: 500 });

    await assert.rejects(
      () => fast.takeTurn(promptInput('retry please')),
      (error) => {
        assert.equal(error.name, 'BamlTransportError');
        assert.equal(error.message, 'BAML provider request failed.');
        return true;
      },
    );
  });

  await check('stream delivers at least one delta before the final result', async () => {
    provider.reset();
    provider.set({ kind: 'answer', reply: 'Streaming answer that arrives in pieces.', pieceDelayMs: 40 });

    const chunks = await collect(openRouter.streamTurn(promptInput('stream please')));
    const text = chunks.filter((chunk) => chunk.kind === 'text');

    // Every chunk must be text. Asserting only on the joined text would let a
    // trailing `failure` chunk — the exact shape a mis-detected end-of-stream
    // produces — pass as success.
    assert.deepEqual(
      [...new Set(chunks.map((chunk) => chunk.kind))],
      ['text'],
      `stream must contain only text chunks, saw ${JSON.stringify(chunks.map((c) => c.kind))}`,
    );
    assert.ok(text.length >= 2, `expected progressive deltas, got ${text.length} text chunk(s)`);
    assert.equal(
      text.map((chunk) => chunk.text).join(''),
      'Streaming answer that arrives in pieces.',
    );
    assert.ok(
      text.every((chunk) => chunk.meta === undefined),
      'meta must be absent, never fabricated',
    );
    assert.equal(provider.requests.length, 1);
    assert.equal(provider.requests[0].model, OPENROUTER_MODEL);
    assert.equal(provider.requests[0].stream, true);
  });

  await check('stream on OpenRouterFast routes to its own compiled model', async () => {
    provider.reset();
    provider.set({ kind: 'answer', reply: 'Fast streamed answer.', pieceDelayMs: 20 });

    const chunks = await collect(fast.streamTurn(promptInput('stream please')));

    assert.deepEqual([...new Set(chunks.map((chunk) => chunk.kind))], ['text']);
    assert.equal(
      chunks
        .filter((chunk) => chunk.kind === 'text')
        .map((chunk) => chunk.text)
        .join(''),
      'Fast streamed answer.',
    );
    assert.equal(provider.requests[0].model, OPENROUTER_FAST_MODEL);
  });

  /* Behavior 0.2 — missing and case-mismatched clients fail before invocation. */

  for (const name of ['NotCompiled', 'openrouter', 'OPENROUTER', '[']) {
    await check(`unknown client ${JSON.stringify(name)}: call returns model_error, no request`, async () => {
      provider.reset();
      provider.set({ kind: 'answer', reply: 'must not be reached' });

      const functions = createBamlFunctionSet({ clientName: name });
      const result = await functions.takeTurn(promptInput('hello'));

      assert.equal(result.kind, 'failure');
      assert.equal(result.failure.code, 'model_error');
      assert.equal(result.failure.message, UNCOMPILED_MESSAGE);
      assert.equal(provider.requests.length, 0, 'no provider request may be issued');
    });

    await check(`unknown client ${JSON.stringify(name)}: stream yields it exactly once`, async () => {
      provider.reset();

      const functions = createBamlFunctionSet({ clientName: name });
      const chunks = await collect(functions.streamTurn(promptInput('hello')));

      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].kind, 'failure');
      assert.equal(chunks[0].failure.code, 'model_error');
      assert.equal(chunks[0].failure.message, UNCOMPILED_MESSAGE);
      assert.equal(provider.requests.length, 0);
    });
  }

  await provider.close();
};

const watchdog = setTimeout(() => {
  process.stderr.write(`\nBAML runtime acceptance exceeded ${WATCHDOG_MS}ms\n`);
  process.exit(1);
}, WATCHDOG_MS);
watchdog.unref();

process.stdout.write('BAML compiled runtime acceptance\n');

await main();

const failed = results.filter((result) => !result.ok);
process.stdout.write(`\n${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length === 0 ? 0 : 1);
