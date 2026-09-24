#!/usr/bin/env node
/**
 * Verifies every model in librechat.yaml `modelSpecs` has an explicit entry in
 * LibreChat's pricing table. A model without one is silently billed at
 * `defaultRate` ($6/1M both directions) or, worse, at a loose prefix match —
 * so spend data looks plausible while being wrong.
 *
 *   node scripts/klima-check-model-pricing.mjs
 *
 * Exits non-zero when a configured model is unpriced.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const TX = 'packages/data-schemas/src/methods/tx.ts';
const YAML = 'librechat.yaml';

/** Minimal extraction: `'model-id': { prompt: N, completion: N }` rows. */
function loadPriceTable() {
  const src = readFileSync(TX, 'utf8');
  const rows = new Map();
  const re = /'([^']+)':\s*\{\s*prompt:\s*([\d.]+),\s*completion:\s*([\d.]+)\s*\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    rows.set(m[1], { prompt: Number(m[2]), completion: Number(m[3]) });
  }
  return rows;
}

/** Reads the spec list without a YAML dependency, via python3. */
function loadSpecs() {
  const out = execFileSync('python3', [
    '-c',
    `import yaml,json;d=yaml.safe_load(open(${JSON.stringify(YAML)}));` +
      `print(json.dumps([{"label":s["label"],"model":s["preset"]["model"],` +
      `"endpoint":s["preset"]["endpoint"]} for s in d.get("modelSpecs",{}).get("list",[])]))`,
  ]);
  return JSON.parse(out.toString());
}

const table = loadPriceTable();
const specs = loadSpecs();
const DEFAULT_RATE = 6;

let unpriced = 0;
console.log(`\n${specs.length} spec(s) in ${YAML}, ${table.size} priced models in ${TX}\n`);

for (const spec of specs) {
  const rate = table.get(spec.model);
  if (rate) {
    console.log(
      `  OK   ${spec.model.padEnd(24)} $${rate.prompt}/$${rate.completion} per 1M   ${spec.label}`,
    );
    continue;
  }
  unpriced++;
  console.log(
    `  !!   ${spec.model.padEnd(24)} NO ENTRY — will bill at defaultRate ` +
      `$${DEFAULT_RATE}/$${DEFAULT_RATE} or a loose prefix match   ${spec.label}`,
  );
}

if (unpriced > 0) {
  console.log(
    `\n${unpriced} model(s) unpriced. Either sync upstream (it ships prices in tx.ts),` +
      `\nor move that provider to a \`custom\` endpoint where librechat.yaml \`tokenConfig\`` +
      `\nlets you set prompt/completion/context yourself.\n`,
  );
  process.exit(1);
}

console.log('\nAll configured models are explicitly priced.\n');
