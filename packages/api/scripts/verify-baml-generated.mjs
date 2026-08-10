import { readFileSync } from 'node:fs';
import {
  FINGERPRINT_FILE,
  GENERATED_DIR,
  SOURCE_DIR,
  currentFingerprint,
  exists,
  parseFingerprint,
} from './bamlFingerprint.mjs';

/**
 * The build guard: is the committed generated SDK the one these BAML sources
 * produce, from the pinned toolchain?
 *
 * Needs no CLI, so every npm, Bun, Turbo, and Docker build can run it. Stale
 * generated output is the failure mode this exists for — it compiles, it ships,
 * and it silently answers with an older protocol.
 */

const fail = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};

if (!exists(SOURCE_DIR)) {
  fail(`Missing BAML sources: ${SOURCE_DIR}`);
}
if (!exists(GENERATED_DIR)) {
  fail(
    `Missing generated BAML SDK: ${GENERATED_DIR}\n` +
      'Run: npm --prefix packages/api run generate:baml',
  );
}
if (!exists(FINGERPRINT_FILE)) {
  fail(
    `Missing ${FINGERPRINT_FILE}\nRun: npm --prefix packages/api run generate:baml`,
  );
}

const recorded = parseFingerprint(readFileSync(FINGERPRINT_FILE, 'utf8'));
const actual = currentFingerprint();

const mismatches = [];
if (recorded.toolchain !== actual.toolchain) {
  mismatches.push(`toolchain: recorded ${recorded.toolchain}, required ${actual.toolchain}`);
}
if (recorded.source !== actual.source) {
  mismatches.push(`baml_src changed: recorded ${recorded.source}, actual ${actual.source}`);
}
if (recorded.generated !== actual.generated) {
  mismatches.push(
    `src/baml/generated changed: recorded ${recorded.generated}, actual ${actual.generated}`,
  );
}

if (mismatches.length > 0) {
  fail(
    `BAML generated output is stale:\n  ${mismatches.join('\n  ')}\n` +
      'Run: npm --prefix packages/api run generate:baml',
  );
}

process.stdout.write('BAML generated output is current.\n');
