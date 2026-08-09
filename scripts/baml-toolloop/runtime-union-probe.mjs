// Spike: can a TypeScript host build a BAML type — specifically a UNION — at RUNTIME?
//
//   npx tsc -p baml_ts/tsconfig.json && node scripts/baml-toolloop/runtime-union-probe.mjs
//
// THE question for "BAML as a new provider" in @librechat/agents, which binds a
// different tool set every turn (MCP, tool registry, deferred loading).
//
// v0 answered with a host-side `TypeBuilder` object + a `tb` call option.
// v1 answers with GENERICS: a BAML function declares a generic return type, and
// the host binds that type variable per call via `$types`, using the `BamlType`
// runtime spelling exported by @boundaryml/baml-bridge:
//
//   type BamlType = 'int'|'string'|... | BamlClassCtor
//                 | { class, args? } | { list } | { map } | { optional }
//                 | { union: BamlType[] }          // <- runtime union
//
// Offline — no API key, no network.

import assert from 'node:assert/strict';
import { toolloop } from '../../baml_ts/dist/index.js';

const { WeatherAPI, SearchAPI } = toolloop;
const parseGeneric = toolloop['SelectToolGeneric$parse'];
const buildRequestGeneric = toolloop['SelectToolGeneric$build_request'];

const WEATHER_JSON = '{"city":"Boston","time_of_day":"2026-08-09T13:00:00Z"}';
const SEARCH_JSON = '{"query":"baml tool calling"}';

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

// ── R1: host binds a generic type var to a class, per call ─────────────────
check('R1 $types binds T to a host-chosen class', () => {
  assert.equal(parseGeneric(WEATHER_JSON, { $types: { T: WeatherAPI } }).city, 'Boston');
});

check('R1b the SAME call site binds a DIFFERENT type on the next call', () => {
  assert.equal(
    parseGeneric(SEARCH_JSON, { $types: { T: SearchAPI } }).query,
    'baml tool calling',
  );
});

// ── R2: a runtime-built union, wrapped in a container — WORKS ─────────────
// This is the parallel-tool-call shape, assembled from a varying array.
check('R2 { list: { union: [...] } } parses at runtime', () => {
  const many = parseGeneric(`[${WEATHER_JSON},${SEARCH_JSON}]`, {
    $types: { T: { list: { union: [WeatherAPI, SearchAPI] } } },
  });
  assert.equal(many.length, 2);
  assert.equal(many[0].city, 'Boston');
  assert.equal(many[1].query, 'baml tool calling');
});

check('R2b the union is assembled from a VARYING tool list', () => {
  // Stands in for AgentContext.getToolsForBinding() returning a different set.
  const wide = [WeatherAPI, SearchAPI];
  const narrow = [WeatherAPI];
  assert.equal(
    parseGeneric(`[${SEARCH_JSON}]`, { $types: { T: { list: { union: wide } } } })[0].query,
    'baml tool calling',
  );
  assert.equal(
    parseGeneric(`[${WEATHER_JSON}]`, { $types: { T: { list: { union: narrow } } } })[0].city,
    'Boston',
  );
});

// ── R3: a BARE top-level union is rejected by the parse path ──────────────
// KNOWN LIMITATION on 0.15.0. Same error as a bare union written in .baml
// source, so it is about union flattening, not about $types. Wrap it (R2).
check('R3 a bare { union: [...] } is rejected: "Unions must be flattened"', () => {
  assert.throws(
    () => parseGeneric(WEATHER_JSON, { $types: { T: { union: [WeatherAPI, SearchAPI] } } }),
    /Unions must be flattened/,
  );
});

// ── R4: the parse path is COERCIVE, not validating ────────────────────────
// Binding a type the JSON does not satisfy does NOT throw — it coerces.
// Recorded because a provider cannot rely on $parse to reject a wrong tool.
check('R4 binding a mismatched type coerces instead of throwing', () => {
  const s = parseGeneric(WEATHER_JSON, { $types: { T: SearchAPI } });
  assert.ok(s !== undefined); // no exception; fields simply do not line up
});

// ── R5: THE BLOCKER — $types does not reach the prompt-schema renderer ────
// `$build_request` renders ${ctx.output_format} for the bound return type, i.e.
// it is what TELLS THE MODEL which tools exist. On 0.15.0 the type variable is
// not substituted before that renderer runs and the runtime PANICS:
//
//   internal error: entered unreachable code: non-data type TypeVar("T", ...)
//   should not reach output_format
//   crates/sys_llm/src/types/output_format.rs:608
//
// So a runtime-bound tool union can be PARSED but cannot yet be DESCRIBED to
// the model. This is an unimplemented path (a panic), not a designed limit —
// worth filing upstream. Pinned so this probe goes green when it is fixed.
check('R5 KNOWN BUG: $types on $build_request panics before output_format', () => {
  assert.throws(
    () => buildRequestGeneric('what is the weather?', { $types: { T: WeatherAPI } }),
    /should not reach output_format/,
  );
});

check('R5b the panic is not specific to unions — a plain class trips it too', () => {
  assert.throws(
    () => buildRequestGeneric('hi', { $types: { T: { list: { union: [WeatherAPI, SearchAPI] } } } }),
    /should not reach output_format/,
  );
});

for (const line of checks) console.log(line);
const failed = checks.filter((c) => c.startsWith('FAIL')).length;
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} ${checks.length - failed}/${checks.length} runtime-union checks`);
