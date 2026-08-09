// The workaround, proven end to end from a TypeScript host.
//
//   npx tsc -p baml_ts/tsconfig.json && node scripts/baml-toolloop/provider-pattern.mjs
//
// Constraint we are working around: `$types` on the live/request path panics
// (`TypeVar("T") should not reach output_format`, output_format.rs:608), so the
// tool schema the MODEL sees cannot be built at runtime on 0.15.0.
//
// The pattern:
//   selection  -> STATIC return type in .baml  -> real schema, no panic
//   narrowing  -> $types on $parse only        -> per-turn tool subset
//   feedback   -> primitives across the bridge -> no instance-array lowering
//
// Offline — no API key, no network.

import assert from 'node:assert/strict';
import { toolloop } from '../../baml_ts/dist/index.js';

const { GetWeather, WebSearch, RunCode, build_transcript } = toolloop;

// Host-side dispatch reads the literal discriminator as a PLAIN FIELD.
// Do NOT call the BAML `tool_of(call: BoundTool)` from here: a host value
// arrives as a map, and a union-typed BAML parameter cannot discriminate a map
// — it coerces into the FIRST variant and throws
// `Missing field \`city\` in external Instance for class GetWeather`.
const toolOf = (call) => call.tool;
const selectParse = toolloop['SelectTools$parse'];
const selectRequest = toolloop['SelectTools$build_request'];
const answerRequest = toolloop['AnswerWithTools$build_request'];

const WEATHER = '{"tool":"get_weather","city":"Boston"}';
const SEARCH = '{"tool":"web_search","query":"baml tool calling"}';
const CODE = '{"tool":"run_code","language":"python","source":"print(1)"}';

const bodyOf = (req) => {
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  return JSON.stringify(JSON.parse(raw).messages ?? raw);
};

const checks = [];
const check = (name, fn) => {
  try {
    fn();
    checks.push(`ok    ${name}`);
  } catch (error) {
    checks.push(`FAIL  ${name}: ${error.message.split('\n')[0]}`);
    process.exitCode = 1;
  }
};

// ── P1: the live path builds a request, with every tool in the schema ──────
check('P1 selection builds a request offline — no type-var panic', () => {
  const body = bodyOf(selectRequest('what is the weather in Boston?', ''));
  assert.match(body, /Answer with a JSON Array using this schema/);
});

check('P1b all three bound tools are described to the model', () => {
  const body = bodyOf(selectRequest('anything', ''));
  assert.match(body, /get_weather/);
  assert.match(body, /web_search/);
  assert.match(body, /run_code/);
});

check('P1c the literal discriminator and field docs reach the schema', () => {
  const body = bodyOf(selectRequest('anything', ''));
  assert.match(body, /the city to look up/);
  assert.match(body, /the language to run/);
  assert.match(body, /python/); // the literal union renders its options
});

// ── P2: parse the selection; the discriminator drives host dispatch ────────
check('P2 a parallel tool selection parses offline', () => {
  const calls = selectParse(`[${WEATHER},${SEARCH}]`);
  assert.equal(calls.length, 2);
  assert.equal(toolOf(calls[0]), 'get_weather');
  assert.equal(toolOf(calls[1]), 'web_search');
});

check('P2b the discriminator is readable as a plain field across the bridge', () => {
  const calls = selectParse(`[${CODE}]`);
  assert.equal(calls[0].tool, 'run_code');
  assert.equal(calls[0].language, 'python');
});

// ── P3: $types narrows the parse to the subset bound THIS turn ─────────────
// This is the runtime-varying half that works today. The .baml declares the
// superset; the host restricts which of them are acceptable per turn.
check('P3 $types narrows parsing to a per-turn tool subset', () => {
  const boundThisTurn = [GetWeather, WebSearch]; // RunCode not offered
  const calls = selectParse(`[${WEATHER},${SEARCH}]`, {
    $types: { T: { list: { union: boundThisTurn } } },
  });
  assert.equal(calls.length, 2);
  assert.equal(toolOf(calls[0]), 'get_weather');
});

check('P3b a different subset on the very next call', () => {
  const calls = selectParse(`[${CODE}]`, {
    $types: { T: { list: { union: [RunCode] } } },
  });
  assert.equal(toolOf(calls[0]), 'run_code');
});

// ── P4: the full loop — host executes, result feeds turn 2 ────────────────
check('P4 host-driven loop: select -> execute -> feed back -> answer', () => {
  // Turn 1
  const calls = selectParse(`[${WEATHER}]`);
  const call = calls[0];

  // The HOST executes the tool. This is the @librechat/agents shape.
  const name = toolOf(call);
  const args = JSON.stringify({ city: call.city });
  const result = JSON.stringify({ temp_f: 61, source: 'host-executed' });

  // Feedback across the bridge: primitives only.
  const transcript = build_transcript([name], [args], [result]);
  assert.match(transcript, /tool_result name="get_weather"/);
  assert.match(transcript, /host-executed/);

  // Turn 2 — the result is in the prompt the model will receive.
  const body = bodyOf(answerRequest('what is the weather in Boston?', transcript));
  assert.match(body, /host-executed/);
  assert.match(body, /61/);
});

check('P4b parallel tool results all reach turn 2', () => {
  const calls = selectParse(`[${WEATHER},${SEARCH}]`);
  const names = calls.map((c) => toolOf(c));
  const args = calls.map((c) => JSON.stringify(c));
  const results = [JSON.stringify({ temp_f: 58 }), JSON.stringify({ hits: 3 })];

  const transcript = build_transcript(names, args, results);
  const body = bodyOf(answerRequest('summarize', transcript));
  assert.match(body, /temp_f/);
  assert.match(body, /hits/);
});

// ── P5: the guardrail — calling BAML with a host value in a union param ───
// Pinned so the pattern's central rule stays honest: dispatch host-side.
check('P5 a union-typed BAML param REJECTS a host value (dispatch host-side)', () => {
  const calls = selectParse(`[${SEARCH}]`);
  assert.throws(
    () => toolloop.tool_of(calls[0]),
    /Missing field|external Instance/,
  );
});

check('P5b reading the discriminator as a plain field is the working route', () => {
  const calls = selectParse(`[${SEARCH}]`);
  assert.equal(toolOf(calls[0]), 'web_search');
});

for (const line of checks) console.log(line);
const failed = checks.filter((c) => c.startsWith('FAIL')).length;
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} ${checks.length - failed}/${checks.length} provider-pattern checks`);
