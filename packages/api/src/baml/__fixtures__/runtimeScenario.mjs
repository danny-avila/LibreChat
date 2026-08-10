/**
 * The subprocess half of `runtime.spec.ts`'s TS/subprocess harness.
 *
 * `runtime.mts` cannot be driven inside Jest: Jest's transform does not handle
 * `.mts`, and even a source-level workaround would defeat the point of testing
 * the artifact the package actually ships. This script runs as a PLAIN Node
 * process — no Jest involved — imports the BUILT `dist/baml/runtime.mjs`, drives
 * one scenario against a real single-use worker and a real loopback OpenAI-wire
 * fixture, and prints one `RESULT_JSON:` line the parent Jest test parses.
 *
 * A scenario is read from a JSON file path passed as argv[2], so the caller
 * never has to shell-escape JSON. Every code path here is best-effort: a bug in
 * THIS script (not in the thing under test) reports an `ok:false` distinct
 * failure shape so a driver bug never gets mistaken for a runtime.mts bug.
 *
 * Timer interception, not a fake clock: the injected `timers` seam wraps the
 * REAL `setTimeout`/`clearTimeout` and additionally calls a hook synchronously
 * on every registration. That hook is what makes "abort right when the pending
 * pull starts" or "abort right when finalization begins" deterministic without
 * guessing at HTTP timing — those transitions each arm a distinct, empirically
 * confirmed position in the setTimeout call sequence (see runtime.spec.ts).
 * Real per-piece delays remain the proof that a fast settlement is not an
 * accident: every fixture scenario is deliberately slower, uninterrupted, than
 * the grace window the assertions allow.
 */

import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../../..');
const RUNTIME_URL = pathToFileURL(path.join(PACKAGE_ROOT, 'dist/baml/runtime.mjs')).href;

const scenarioPath = process.argv[2];
if (scenarioPath == null) {
  process.stderr.write('usage: node runtimeScenario.mjs <scenario.json>\n');
  process.exit(2);
}
const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8'));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ─────────────────────────────── loopback provider ─────────────────────────── */

const createProvider = (spec) => {
  const requests = [];
  let attempt = 0;

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

  const bodyOf = () =>
    spec.body != null ? spec.body : { reply: spec.reply ?? null, tools: spec.tools ?? [] };

  // Races the artificial per-piece delay against the response socket actually
  // closing, so a client-side abort is noticed the moment it happens instead of
  // only at the next scheduled checkpoint — the difference between an honest
  // "did upstream work really stop" signal and one that just measures how long
  // this fixture's own timers happen to run.
  const sleepOrClosed = (res, ms) =>
    new Promise((resolve) => {
      const onClose = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        res.off('close', onClose);
        resolve();
      }, ms);
      res.once('close', onClose);
    });

  const sendSse = async (res, requestRecord) => {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    const pieces = spec.pieces ?? [{ text: JSON.stringify(bodyOf()), delayMs: 0 }];
    for (const piece of pieces) {
      if (requestRecord.aborted) {
        return;
      }
      if ((piece.delayMs ?? 0) > 0) {
        await sleepOrClosed(res, piece.delayMs);
      }
      if (requestRecord.aborted) {
        return;
      }
      res.write(
        `data: ${JSON.stringify({
          id: 'chatcmpl-fixture',
          object: 'chat.completion.chunk',
          created: 0,
          model: 'fixture',
          choices: [{ index: 0, delta: { content: piece.text }, finish_reason: null }],
        })}\n\n`,
      );
    }
    if (requestRecord.aborted) {
      return;
    }
    if ((spec.holdBeforeDoneMs ?? 0) > 0) {
      await sleepOrClosed(res, spec.holdBeforeDoneMs);
    }
    if (requestRecord.aborted) {
      return;
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
      attempt += 1;
      const record = { url: req.url, aborted: false, index: attempt };
      requests.push(record);
      // `res`'s own close, not `req`'s: the response socket closing before
      // `res.end()` completed is what actually means "the client tore this
      // request down", regardless of when the request body finished reading.
      res.on('close', () => {
        if (!res.writableEnded) {
          record.aborted = true;
        }
      });

      if (spec.kind === 'hang') {
        return; // never responds; the caller must abort to end this request
      }

      if ((spec.holdMs ?? 0) > 0) {
        await sleep(spec.holdMs);
        if (record.aborted) {
          return;
        }
      }

      const raw = await readBody(req);
      let parsedBody = {};
      try {
        parsedBody = JSON.parse(raw || '{}');
      } catch {
        parsedBody = {};
      }
      record.model = parsedBody.model;
      record.stream = parsedBody.stream === true;
      record.prompt = (parsedBody.messages ?? [])
        .flatMap((message) =>
          Array.isArray(message.content)
            ? message.content.map((part) => part.text ?? '')
            : [message.content ?? ''],
        )
        .join('\n');

      const failFirstN = spec.failFirstN ?? 0;
      if (spec.kind === 'error' || attempt <= failFirstN) {
        sendJson(res, spec.status ?? 500, { error: { message: 'fixture failure' } });
        return;
      }

      if (parsedBody.stream === true) {
        await sendSse(res, record);
        return;
      }
      sendJson(res, 200, completion(JSON.stringify(bodyOf())));
    })();
  });

  return {
    requests,
    listen: () =>
      new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () =>
          resolve(`http://127.0.0.1:${server.address().port}/v1`),
        );
      }),
    // `server.close()` alone waits for every open connection to end on its own,
    // including one an aborted worker never tore down at the TCP level (observed:
    // that can outlast the whole grace-period budget by seconds). This adapter's
    // contract is about the CALLER's promise and the JS worker context, not about
    // how promptly a third-party native HTTP client releases its socket, so the
    // fixture forces the issue instead of letting a lingering connection stall
    // every abort scenario's teardown.
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
};

/* ────────────────────────────── timer interception ─────────────────────────── */

const createTimers = (onSetTimeoutCall) => {
  const log = [];
  let n = 0;
  return {
    timers: {
      setTimeout: (handler, ms) => {
        n += 1;
        const index = n;
        log.push(ms);
        const handle = setTimeout(handler, ms);
        if (onSetTimeoutCall != null) {
          onSetTimeoutCall(index, ms, handler);
        }
        return handle;
      },
      clearTimeout: (handle) => clearTimeout(handle),
    },
    log,
  };
};

/* ──────────────────────────────────── main ─────────────────────────────────── */

const promptInput = () => ({
  version: scenario.input?.version ?? 1,
  transcript: scenario.input?.transcript ?? [
    { role: 'user', content: scenario.input?.text ?? 'hello' },
  ],
  allowedTools: scenario.input?.allowedTools ?? [],
});

const main = async () => {
  const provider = createProvider(scenario.provider ?? { kind: 'answer', reply: 'ok' });
  const baseUrl = await provider.listen();
  process.env.BAML_OPENROUTER_BASE_URL = baseUrl;
  process.env.OPENROUTER_API_KEY = 'fixture-key';

  const { createBamlFunctionSet } = await import(RUNTIME_URL);

  const controller = new AbortController();
  if (scenario.abort?.mode === 'preAborted') {
    controller.abort();
  }

  let abortRequested = false;
  const abortAtCall = scenario.abort?.mode === 'onSetTimeoutCall' ? scenario.abort.atCall : null;
  const deadlineAtCall =
    scenario.deadline?.mode === 'forceOnSetTimeoutCall' ? scenario.deadline.atCall : null;

  const { timers, log: setTimeoutLog } = createTimers((index, _ms, handler) => {
    if (abortAtCall != null && index === abortAtCall && !abortRequested) {
      abortRequested = true;
      controller.abort();
    }
    if (deadlineAtCall != null && index === deadlineAtCall) {
      handler();
    }
  });

  const diagnostics = [];
  const functions = createBamlFunctionSet({
    clientName: scenario.clientName,
    timers,
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  });

  const hasSignal = scenario.input?.signal !== 'none';
  const input = { ...promptInput(), ...(hasSignal ? { signal: controller.signal } : {}) };

  const start = Date.now();
  const result = { setTimeoutLog, diagnostics };
  // Declared outside the try so a mid-stream rejection still reports exactly
  // what the consumer actually received before the throw, not `undefined` —
  // "no late chunk is observed" needs the chunks that WERE observed to assert
  // against.
  const chunks = [];

  try {
    if (scenario.mode === 'call') {
      const outcome = await functions.takeTurn(input);
      result.ok = true;
      result.outcome = outcome.kind === 'failure' ? 'yieldedFailure' : 'resolved';
      result.value = outcome;
    } else {
      const iterator = functions.streamTurn(input)[Symbol.asyncIterator]();
      const returnAfter = scenario.consumerReturn?.after ?? null;
      // Distinct from `abort.mode: 'onSetTimeoutCall'`: that hook fires
      // synchronously INSIDE the parent's per-chunk `armStep` call, which runs
      // BEFORE the chunk is queued for delivery — it cannot represent "abort
      // after the consumer already has the chunk in hand". This one aborts from
      // the consumer's own loop, strictly after `chunks.push`, which is what
      // "after-partial" actually means.
      const abortAfterChunks =
        scenario.abort?.mode === 'afterChunks' ? scenario.abort.atCount : null;
      for (;;) {
        const step = await iterator.next();
        if (step.done === true) {
          break;
        }
        chunks.push(step.value);
        if (step.value.kind === 'failure') {
          break;
        }
        if (abortAfterChunks != null && chunks.length >= abortAfterChunks) {
          controller.abort();
        }
        if (returnAfter != null && chunks.length >= returnAfter) {
          await iterator.return();
          break;
        }
      }
      result.ok = true;
      result.outcome = chunks.some((chunk) => chunk.kind === 'failure')
        ? 'yieldedFailure'
        : 'resolved';
      result.chunks = chunks;
    }
  } catch (error) {
    result.ok = true;
    result.outcome = 'rejected';
    result.errorName = error?.name ?? null;
    result.errorMessage = error?.message ?? String(error);
    if (scenario.mode !== 'call') {
      result.chunks = chunks;
    }
  }

  result.elapsedMs = Date.now() - start;

  // The parent settles the caller's promise the instant it decides the outcome,
  // strictly before it finishes tearing the worker/connection down (that is the
  // whole point: the caller is never blocked on cleanup). Reading the fixture's
  // aborted-connection flag before that teardown has had a chance to run would
  // make a real abort look identical to a normal completion. Settle window is
  // comfortably longer than BAML_WORKER_ABORT_GRACE_MS (250ms).
  await sleep(400);
  await provider.close();

  result.providerRequestCount = provider.requests.length;
  result.providerRequests = provider.requests.map((request) => ({
    model: request.model,
    stream: request.stream,
    prompt: request.prompt,
    aborted: request.aborted,
  }));
  result.providerLastRequestAborted =
    provider.requests.length > 0 ? provider.requests[provider.requests.length - 1].aborted : null;

  return result;
};

const WATCHDOG_MS = scenario.timeoutMs ?? 20_000;
const watchdog = setTimeout(() => {
  process.stdout.write(
    `RESULT_JSON:${JSON.stringify({ ok: false, error: 'scenario watchdog exceeded' })}\n`,
  );
  process.exit(1);
}, WATCHDOG_MS);
watchdog.unref();

try {
  const result = await main();
  process.stdout.write(`RESULT_JSON:${JSON.stringify(result)}\n`);
  process.exit(0);
} catch (error) {
  process.stdout.write(
    `RESULT_JSON:${JSON.stringify({ ok: false, error: error?.stack ?? String(error) })}\n`,
  );
  process.exit(1);
}
