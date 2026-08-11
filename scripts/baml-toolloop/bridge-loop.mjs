// Spike: can a tool RESULT be fed back into the next turn, from a TypeScript host?
//
//   npx tsc -p baml_ts/tsconfig.json && node scripts/baml-toolloop/bridge-loop.mjs
//
// Offline — no API key, no network. Turn 1 is a canned model output parsed with
// `$parse`; the tool runs; the result is threaded into the turn-2 prompt text.
//
// The load-bearing question is B2/B3: BAML class instances crossing INTO a BAML
// parameter. Prior spike claim C18 recorded that direction as broken
// ("expected instance, got map"). These checks pin the current behaviour either
// way, so the answer stops being folklore.

import assert from 'node:assert/strict';
// The ROOT barrel is what calls initializeRuntimeFromBytecode(). Importing
// `dist/toolloop/index.js` directly throws "BAML runtime has not been
// initialized" — namespace modules do not self-initialize.
import { toolloop } from '../../baml_ts/dist/index.js';

const {
  TURN1_WEATHER,
  TURN1_SEARCH,
  invocation_to_call,
  execute_tool,
  tool_name,
  tool_arguments_json,
  render_transcript,
  render_transcript_flat,
  loop_offline,
  ToolTurn,
  WeatherAPI,
} = toolloop;
const SelectTool$parse = toolloop['SelectTool$parse'];

const checks = [];
const check = (name, fn) => {
  try {
    fn();
    checks.push(`ok    ${name}`);
  } catch (error) {
    checks.push(`FAIL  ${name}: ${error.message}`);
    process.exitCode = 1;
  }
};

// ── B1: the whole loop stays inside BAML; only strings cross the bridge ──────
check('B1 loop_offline feeds the tool result into turn 2', () => {
  const fed = loop_offline('what is the weather?', TURN1_WEATHER());
  assert.match(fed, /temp_f/);
  assert.match(fed, /Boston/);
  assert.match(fed, /tool_result/);
});

check('B1b the loop discriminates on the selected tool', () => {
  const fed = loop_offline('find me docs', TURN1_SEARCH());
  assert.match(fed, /hits/);
  assert.match(fed, /baml tool calling/);
});

// ── B2: an instance comes OUT to JS, then goes BACK IN (the C18 shape) ──────
check('B2 a parsed instance returns to JS', () => {
  const inv = SelectTool$parse(TURN1_WEATHER());
  assert.equal(inv.tool, 'weather');
  assert.equal(inv.weather.city, 'Boston');
});

// EXPECTED TO FAIL on 0.15.0: `inv` survives the trip out, but its NESTED
// `weather` field arrives back as a map, so `if let w: WeatherAPI` inside
// invocation_to_call never narrows and the function throws instead.
check('B2b an instance with NESTED class fields does NOT round-trip', () => {
  const inv = SelectTool$parse(TURN1_WEATHER());
  assert.throws(() => invocation_to_call(inv), /no arguments for tool weather/);
});

// ── B3: a JS-CONSTRUCTED instance array crosses into a baml parameter ───────
// EXPECTED TO FAIL on toolchain 0.15.0. Pinned as a negative assertion so this
// spike tells us the day BAML fixes it, instead of silently passing.
check('B3 a JS-built ToolTurn[] is REJECTED (arrays of instances lower to maps)', () => {
  const turn = new ToolTurn({
    tool_name: 'weather',
    arguments_json: '{"city":"Boston"}',
    result_json: '{"temp_f":58}',
  });
  assert.throws(() => render_transcript([turn]), /expected instance, got map/);
});

check('B3b a JS-built WeatherAPI crosses into a union parameter', () => {
  const call = new WeatherAPI({ city: 'Denver', time_of_day: '2026-08-09T13:00:00Z' });
  assert.equal(tool_name(call), 'weather');
  assert.match(tool_arguments_json(call), /Denver/);
});

// ── B4: the WORKING host-driven loop — JS owns tool execution ──────────────
// This is the @librechat/agents shape: the host runs the tool, then threads the
// result back. Everything crossing the bridge is a primitive.
check('B4 host-driven loop works when the boundary is primitives only', () => {
  // Turn 1: read the selection off the parsed instance by FIELD, not by
  // narrowing — field reads survive the bridge even though `if let` does not.
  const inv = SelectTool$parse(TURN1_WEATHER());
  const selected = inv.tool;
  const args = JSON.stringify(inv.weather);
  assert.equal(selected, 'weather');

  // The host — not BAML — executes the tool.
  const hostResult = JSON.stringify({ temp_f: 61, source: 'host-executed' });

  // Turn 2: parallel primitive arrays instead of ToolTurn[].
  const rendered = render_transcript_flat([selected], [args], [hostResult]);
  assert.match(rendered, /host-executed/);
  assert.match(rendered, /61/);
  assert.match(rendered, /tool_result name="weather"/);
});

// ── B5: BAML-owned loop is unaffected — only strings cross ─────────────────
check('B5 keeping the loop inside BAML sidesteps the boundary entirely', () => {
  assert.match(loop_offline('weather?', TURN1_WEATHER()), /temp_f/);
  assert.match(loop_offline('search?', TURN1_SEARCH()), /hits/);
});

for (const line of checks) console.log(line);
const failed = checks.filter((c) => c.startsWith('FAIL')).length;
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} ${checks.length - failed}/${checks.length} bridge checks`);
