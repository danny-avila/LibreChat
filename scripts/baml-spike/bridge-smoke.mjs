// End-to-end proof that the generated BAML SDK executes from Node.
//
//   node scripts/baml-spike/bridge-smoke.mjs
//
// Requires @boundaryml/baml-bridge (already a root dependency) and a prior
// `baml generate`. Exits non-zero if any assertion fails.

import assert from 'node:assert/strict';
import {
  report,
  describe_calls,
  urls,
  auths,
  bodies,
  claims,
  claim_total,
  falsified_total,
} from '../../baml_ts/dist/spike/index.js';
import { main, main_async } from '../../baml_ts/dist/index.js';

const checks = [];
const check = (name, fn) => {
  try {
    fn();
    checks.push(`ok   ${name}`);
  } catch (error) {
    checks.push(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
  }
};

check('root function returns its value synchronously', () => {
  assert.equal(main(), 'hello from baml');
});

check('per-request base_url survives the bridge', () => {
  const [a, b] = urls();
  assert.ok(a.startsWith('https://api.openai.com/v1'));
  assert.ok(b.startsWith('http://10.0.0.7:8080/v1'));
  assert.notEqual(a, b);
});

check('per-request api_key survives the bridge', () => {
  assert.deepEqual(auths(), ['Bearer key-aaa', 'Bearer key-bbb']);
});

check('per-request model survives the bridge', () => {
  const [a, b] = bodies();
  assert.ok(a.includes('"model":"gpt-4o-mini"'));
  assert.ok(b.includes('"model":"llama-3.1-70b"'));
});

check('the claim report crosses the bridge intact', () => {
  const all = claims();
  const text = report();
  // Derived from the data, so adding a claim can never silently desync this.
  assert.equal(all.length, claim_total());
  assert.ok(text.includes(`${claim_total()} claims`));
  assert.ok(text.includes(`${falsified_total()} falsified`));
  // Every claim id must appear in the rendered report — catches a dropped row.
  for (const c of all) {
    assert.ok(text.includes(c.id), `report is missing ${c.id}`);
  }
});

const asyncResult = await main_async();
check('async variant resolves', () => {
  assert.equal(asyncResult, 'hello from baml');
});

console.log(checks.join('\n'));
console.log('\n--- describe_calls() via Node ---');
console.log(describe_calls());
console.log(
  process.exitCode ? '\nFAILED' : `\nPASS ${checks.length}/${checks.length} bridge checks`,
);
