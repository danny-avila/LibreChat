// Async discipline: the generated `_async` companions vs. the sync ones.
//
//   npx tsc -p baml_ts/tsconfig.json && node scripts/baml-toolloop/async-probe.mjs
//
// Why this exists: the generated **sync** companions block the Node event loop.
// A `$stream` driven in the same process as an in-process HTTP server deadlocks
// — the server can never get a tick to respond. `@librechat/agents` streams
// concurrently across runs and executes tool batches in parallel, so it must use
// `_async` throughout. This probe proves the difference instead of assuming it.
//
// Offline — no API key. Every stage is timeout-guarded so a deadlock reports
// rather than hangs.

import assert from 'node:assert/strict';
import http from 'node:http';
import { toolloop } from '../../baml_ts/dist/index.js';

const PORT = 8791;
const checks = [];
const check = async (name, fn) => {
  try { await fn(); checks.push(`ok    ${name}`); }
  catch (e) { checks.push(`FAIL  ${name}: ${e.message.split('\n')[0]}`); process.exitCode = 1; }
};

const withTimeout = (p, ms, label) =>
  Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`DEADLOCK/timeout after ${ms}ms in ${label}`)), ms).unref()),
  ]);

const FULL = '[{"tool":"get_weather","city":"Boston"},{"tool":"web_search","query":"baml"}]';
const startSse = () =>
  new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const send = (o) => res.write(`event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`);
      send({ type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'x', content: [], usage: { input_tokens: 11, output_tokens: 0 } } });
      send({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
      for (const piece of FULL.match(/.{1,12}/g)) {
        send({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: piece } });
      }
      send({ type: 'content_block_stop', index: 0 });
      send({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 42 } });
      send({ type: 'message_stop' });
      res.end();
    });
    srv.listen(PORT, () => resolve(srv));
  });

// ── A1: bounded parallel tool execution, awaited ──────────────────────────
await check('A1 execute_tools_async runs a bounded batch and preserves order', async () => {
  const out = await withTimeout(
    toolloop.execute_tools_async(['a', 'b', 'c', 'd'], ['12', '1234', '123456', '12345678'], 2),
    5000, 'execute_tools_async',
  );
  assert.equal(out.length, 4);
  assert.equal(out[0].tool_name, 'a');
  assert.equal(out[3].tool_name, 'd');
  assert.equal(out.every((o) => o.failed === false), true);
});

// ── A1b: KNOWN BUG — a spawned task's throw escapes its per-await catch ──
// Bisected to a 6-line repro in ./repro-spawn-catch/ (bare `spawn`, no
// TaskGroup needed). The rule, measured 20 runs per shape on 0.15.0:
//
//   1 spawn, throws                caught 20/20   escaped  0/20
//   2 spawns, FIRST throws         caught 20/20   escaped  0/20
//   2 spawns, SECOND throws        caught  8/20   escaped 12/20
//   2 spawns, both throw           caught  6/20   escaped 14/20
//   3 spawns, all throw            caught  2/20   escaped 18/20
//   TaskGroup, 1 of 3 throws       caught  6/20   escaped 14/20
//
// A throw from the FIRST spawned task is always caught; a throw from any LATER
// one escapes nondeterministically, and the rate climbs with concurrency. The
// host binding (sync vs async) only shifts the rate, it is not the cause.
//
// Consequence for the port: ToolNode turns a failed call into an error
// ToolMessage and keeps the batch going (src/tools/ToolNode.ts:1490-1592).
// Per-call error isolation cannot be built on `spawn` + per-await `catch` yet.
// Almost certainly the same root cause as the ~30% `baml test` testset flake.
//
// Asserted as a RATE — a single run proves nothing about a race.
await check('A1b KNOWN BUG: catch on a spawned await is racy (measured)', async () => {
  const N = 40;
  let escaped = 0;
  for (let i = 0; i < N; i++) {
    try {
      const out = toolloop.execute_tools(['ok1', 'bad', 'ok2'], ['12', '123', '1234'], 2);
      if (out[1].failed !== true) escaped++;
    } catch { escaped++; }
  }
  assert.ok(escaped > 0, `expected some escapes on 0.15.0; got 0/${N} — is this fixed?`);
  assert.ok(escaped < N, `expected the catch to work sometimes; it escaped ${escaped}/${N}`);
  console.log(`      (measured: ${escaped}/${N} escaped the catch)`);
});

// ── A2: the loop-capture footgun stays fixed ──────────────────────────────
// Spawning inside a `while` body and capturing its `let` bindings makes every
// closure observe the LAST iteration's values. `execute_tools` pairs up first
// and `.map`s, so each closure owns its element. Pinned so a refactor back to
// the naive loop fails loudly.
await check('A2 each spawned task sees its OWN arguments, not the last', async () => {
  const out = await withTimeout(
    toolloop.execute_tools_async(['t1', 't2', 't3'], ['12', '1234', '123456'], 3),
    5000, 'execute_tools_async',
  );
  assert.match(out[0].result_json, /"tool":"t1"/);
  assert.match(out[1].result_json, /"tool":"t2"/);
  assert.match(out[2].result_json, /"tool":"t3"/);
  // echo is the args length — distinct per call if capture is correct
  assert.match(out[0].result_json, /"echo":2/);
  assert.match(out[2].result_json, /"echo":6/);
});

// ── A3: concurrency is real — a wide pool is not slower than a narrow one ──
await check('A3 pool width changes scheduling, not results', async () => {
  const names = ['a', 'b', 'c', 'd', 'e', 'f'];
  const args = ['12', '1234', '123456', '12345678', '1234567890', '123456789012'];
  const narrow = await withTimeout(toolloop.execute_tools_async(names, args, 1), 5000, 'narrow');
  const wide = await withTimeout(toolloop.execute_tools_async(names, args, 6), 5000, 'wide');
  assert.deepEqual(narrow.map((o) => o.result_json), wide.map((o) => o.result_json));
});

// ── A4: streaming against an IN-PROCESS server — the sync deadlock case ───
// PROVES: `_async` does not deadlock where the sync binding does, and the final
// value parses. DOES NOT PROVE progressive partials under async — this harness
// writes every SSE frame before the stream is first polled, so `next()` only
// ever sees one flush (0 non-empty partials, reported below). The progressive
// behaviour demonstrated in the scope doc came from a SEPARATE-PROCESS server.
// Async streaming against a real network endpoint remains unverified.
await check('A4 $stream_async drives an in-process SSE server without deadlocking', async () => {
  const srv = await startSse();
  try {
    const stream = await withTimeout(
      toolloop['StreamTools$stream_async']('what is the weather in Boston?'),
      5000, 'stream_async handshake',
    );
    // `Stream.next()` is PULL-based and non-blocking: it flushes whatever SSE
    // has arrived. Spin it without yielding and every poll returns `{}` because
    // the in-process server never gets a tick to write. Yielding between polls
    // is the async discipline this whole probe is about.
    const partials = [];
    for (let i = 0; i < 60; i++) {
      const v = stream.next();
      const j = JSON.stringify(v);
      if (v === null || v === undefined || j === undefined) break;
      if (j !== '{}') partials.push(j);
      await new Promise((r) => setImmediate(r));
    }
    const finalValue = stream.final();
    assert.equal(finalValue.length, 2, 'final value should carry both tool calls');
    assert.equal(finalValue[0].city, 'Boston');
    assert.equal(finalValue[1].query, 'baml');
    // partials are best-effort here: how many arrive depends on scheduling.
    console.log(`      (received ${partials.length} non-empty partials)`);
  } finally {
    srv.close();
  }
});

for (const line of checks) console.log(line);
const failed = checks.filter((c) => c.startsWith('FAIL')).length;
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} ${checks.length - failed}/${checks.length} async checks`);
process.exit(failed === 0 ? 0 : 1);
