import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..');
const REPO_ROOT = path.resolve(PACKAGE_ROOT, '../..');

const readRepoFile = (relative) => readFileSync(path.join(REPO_ROOT, relative), 'utf8');

test('all supported build commands own the package-local BAML graph', () => {
  const rootPackage = JSON.parse(readRepoFile('package.json'));
  const apiPackage = JSON.parse(readRepoFile('packages/api/package.json'));
  const turbo = JSON.parse(readRepoFile('turbo.json'));

  for (const script of ['build', 'build:dev', 'b:build', 'b:build:dev']) {
    assert.match(apiPackage.scripts[script], /verify:baml/);
    assert.match(apiPackage.scripts[script], /verify:baml-dist/);
  }

  for (const script of ['build', 'build:safe', 'build:packages', 'frontend']) {
    assert.doesNotMatch(rootPackage.scripts[script], /build:baml/);
  }

  const inputs = new Set(turbo.tasks.build.inputs);
  for (const input of [
    'baml.toml',
    'baml_src/**',
    'baml.generated.sha256',
    'src/baml/generated/**',
    'scripts/**',
    'tsdown.config.mjs',
  ]) {
    assert.ok(inputs.has(input), `Turbo input is missing ${input}`);
  }
});

test('release acceptance drivers exist at the production boundaries', () => {
  for (const relative of [
    'packages/api/scripts/baml-compiled-consumer.mjs',
    'packages/api/scripts/baml-build-matrix.mjs',
    'packages/api/scripts/baml-watch-acceptance.mjs',
    'scripts/baml-docker-acceptance.mjs',
  ]) {
    assert.doesNotThrow(() => readRepoFile(relative), `${relative} must exist`);
  }
});

test('the installer pins every supported archive and rejects mismatches', (context) => {
  const installer = readRepoFile('scripts/install-baml-toolchain.sh');
  const pins = new Map([
    ['aarch64-apple-darwin', '8a95e1b60527481f1706848dae530aa6857963fe9499b6d8cc41448d4c29259b'],
    ['x86_64-apple-darwin', 'ad011e54a873fcf86896ddb0802395f1f368574f3551de22411cc0109d62aa3f'],
    [
      'aarch64-unknown-linux-gnu',
      '39fcc5e552fbd803185878aec71d4b578da5240360f8b4d7d51a550ed4d7eab5',
    ],
    [
      'aarch64-unknown-linux-musl',
      '95a212f11e0c863dcaa651e820dfed17b010d31f4ca56b62e6226940a7fb1b13',
    ],
    [
      'x86_64-unknown-linux-gnu',
      '2d93245c2e01c946d3225a4af10a7eaee660289cccd8166da46ac884c2283f60',
    ],
    [
      'x86_64-unknown-linux-musl',
      '1969d8947b6a19fe61a8cfa7dd6ef7c8e9d41153c11f5e7e50639bec39e2b888',
    ],
  ]);

  assert.match(installer, /BAML_VERSION=0\.15\.0/);
  for (const [target, checksum] of pins) {
    assert.ok(installer.includes(`baml-language-0.15.0-${target}.tar.gz`));
    assert.ok(installer.includes(checksum));
  }

  const temp = mkdtempSync(path.join(os.tmpdir(), 'baml-installer-contract-'));
  context.after(() => rmSync(temp, { force: true, recursive: true }));
  const corrupt = path.join(temp, 'corrupt.tar.gz');
  writeFileSync(corrupt, 'not a release archive');
  const result = spawnSync(
    'sh',
    [path.join(REPO_ROOT, 'scripts/install-baml-toolchain.sh'), '--archive', corrupt],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        BAML_BIN_DIR: path.join(temp, 'bin'),
        BAML_INSTALL_ROOT: path.join(temp, 'toolchains'),
      },
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /archive|checksum/i);

  const fakeBin = path.join(temp, 'fake-bin');
  const fakeBaml = path.join(fakeBin, 'baml');
  mkdirSync(fakeBin);
  writeFileSync(fakeBaml, '#!/bin/sh\nprintf "%s\\n" "baml-cli 0.14.0"\n');
  chmodSync(fakeBaml, 0o755);
  const versionMismatch = spawnSync(
    'sh',
    [path.join(REPO_ROOT, 'scripts/install-baml-toolchain.sh'), '--verify'],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ''}` },
    },
  );

  assert.notEqual(versionMismatch.status, 0);
  assert.match(`${versionMismatch.stdout}${versionMismatch.stderr}`, /version mismatch/i);
});

test('CI regenerates before diffing and Docker ships only package dist', () => {
  const workflow = readRepoFile('.github/workflows/build.yml');
  const dockerfile = readRepoFile('Dockerfile.multi');

  assert.match(workflow, /install-baml-toolchain\.sh/);
  assert.match(workflow, /npm --prefix packages\/api run generate:baml/);
  assert.match(
    workflow,
    /git diff --exit-code -- packages\/api\/baml_src packages\/api\/src\/baml\/generated packages\/api\/baml\.generated\.sha256/,
  );

  assert.match(
    dockerfile,
    /COPY --from=api-package-build \/app\/packages\/api\/dist \.\/packages\/api\/dist/,
  );
  assert.doesNotMatch(dockerfile, /COPY (?:--from=[^ ]+ )?baml_ts/);
  assert.doesNotMatch(dockerfile, /COPY packages\/api\/src\/baml/);
});
