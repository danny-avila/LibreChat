#!/usr/bin/env node
// Golden query test harness: validates tractor agent against known scenarios
// Usage: node extensions/goldenHarness.js
// Standalone; invokes tool directly; compares output to expected SKUs.

const WoodlandAISearchTractor = require('../../../tools/structured/WoodlandAISearchTractor');
const { logger } = require('~/config');

const GOLDEN_SCENARIOS = [
  {
    id: 'JD_D130_42_Classic',
    input: { make: 'John Deere', model: 'D130', deck: '42', rake: 'Classic' },
    expect: { mda: '206D', hitch: '208-090', hose: '305', rubber_collar: '251' },
  },
  {
    id: 'JD_D130_42_Commander',
    input: { make: 'John Deere', model: 'D130', deck: '42', rake: 'Commander' },
    expect: { mda: '230D', hitch: '208-090', hose: '304JP', rubber_collar: '250' },
  },
  {
    id: 'Craftsman_T260_48_CommercialPro',
    input: { make: 'Craftsman', model: 'T260', deck: '48', rake: 'Commercial Pro' },
    expect: { mda: '230D', hitch: '208-090' }, // partial expectation
  },
];

async function runGoldenTests() {
  const tool = new WoodlandAISearchTractor();
  const results = [];
  for (const scenario of GOLDEN_SCENARIOS) {
    const start = Date.now();
    let pass = false;
    let actual = {};
    try {
      const query = `${scenario.input.make} ${scenario.input.model} ${scenario.input.deck} ${scenario.input.rake}`;
      const raw = await tool._call({ query, model: scenario.input.rake });
      const parsed = JSON.parse(raw);
      const doc = parsed?.docs?.[0];
      if (doc?.normalized_compat) {
        const oem = doc.normalized_compat.oem || {};
        actual = {
          mda: oem.mda,
          hitch: oem.hitch,
          hose: oem.hose,
          rubber_collar: oem.rubber_collar,
        };
        // Check all expected fields match
        pass = Object.entries(scenario.expect).every(
          ([k, v]) => actual[k] === v || (!v && !actual[k]),
        );
      }
    } catch (err) {
      logger.error(`[goldenHarness] Scenario ${scenario.id} failed`, err);
    }
    const latency = Date.now() - start;
    results.push({ id: scenario.id, pass, actual, expected: scenario.expect, latencyMs: latency });
  }
  return results;
}

if (require.main === module) {
  (async () => {
    console.log('Running golden query tests...');
    const results = await runGoldenTests();
    console.log(JSON.stringify(results, null, 2));
    const failCount = results.filter((r) => !r.pass).length;
    if (failCount > 0) {
      console.error(`❌ ${failCount} test(s) failed`);
      process.exit(1);
    } else {
      console.log(`✅ All ${results.length} test(s) passed`);
      process.exit(0);
    }
  })();
}

module.exports = { runGoldenTests };
