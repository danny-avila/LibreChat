import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { INLINED_BYTECODE_FILE, normalizeBamlSourcePaths } from './bamlGeneratedPaths.mjs';
import {
  BAML_TOOLCHAIN_VERSION,
  FINGERPRINT_FILE,
  PACKAGE_ROOT,
  SOURCE_DIR,
  currentFingerprint,
  renderFingerprint,
} from './bamlFingerprint.mjs';

/**
 * Regenerates the committed BAML SDK and re-stamps its freshness fingerprint.
 *
 * Developer-only: normal, CI, and Docker builds run `verify-baml-generated.mjs`
 * instead, so no build path needs the toolchain installed. The version is
 * asserted rather than assumed — generated output from a different toolchain is
 * a silent behavior change, and the fingerprint would happily record it.
 */

const repoRoot = path.resolve(PACKAGE_ROOT, '../..');

const toolchainVersion = () => {
  const output = execFileSync('baml', ['--version'], { encoding: 'utf8' });
  const match = /baml toolchain (\S+)/.exec(output);
  return match?.[1] ?? '';
};

const version = toolchainVersion();
if (version !== BAML_TOOLCHAIN_VERSION) {
  process.stderr.write(
    `BAML toolchain ${BAML_TOOLCHAIN_VERSION} is required, found ${version || '<none>'}.\n` +
      'Run ./scripts/install-baml-toolchain.sh to install the pinned toolchain.\n',
  );
  process.exit(1);
}

execFileSync('baml', ['generate', '--from', 'packages/api', '--color', 'never'], {
  cwd: repoRoot,
  stdio: 'inherit',
});

const normalized = normalizeBamlSourcePaths(
  readFileSync(INLINED_BYTECODE_FILE, 'utf8'),
  SOURCE_DIR,
);
writeFileSync(INLINED_BYTECODE_FILE, normalized.text);

const fingerprint = currentFingerprint();
writeFileSync(FINGERPRINT_FILE, renderFingerprint(fingerprint));

process.stdout.write(
  `normalized ${normalized.replacements} embedded BAML source path(s)\n` +
    `baml.generated.sha256 updated\n  toolchain ${fingerprint.toolchain}\n` +
    `  baml_src ${fingerprint.source}\n  generated ${fingerprint.generated}\n`,
);
