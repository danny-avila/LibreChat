import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  CANONICAL_BAML_SOURCE_ROOT,
  INLINED_BYTECODE_FILE,
  assertCanonicalBamlSourcePaths,
  decodeBytecodeModule,
  embeddedBamlSourcePaths,
  normalizeBamlSourcePaths,
} from './bamlGeneratedPaths.mjs';

const scriptsRoot = import.meta.dirname;

const renderModule = (bytes) => {
  const rows = [];
  for (let index = 0; index < bytes.length; index += 24) {
    rows.push(`  ${[...bytes.subarray(index, index + 24)].join(', ')}, `);
  }
  return `export const BYTECODE = new Uint8Array([\n${rows.join('\n')}\n]);\n`;
};

const framed = (value) => {
  const encoded = Buffer.from(value);
  const length = Buffer.alloc(4);
  length.writeUInt32LE(encoded.length);
  return Buffer.concat([length, encoded]);
};

test('normalizes every framed BAML source path, updates lengths, and is idempotent', () => {
  const relativePaths = [
    'ns_host/clients.baml',
    'ns_host/protocol.baml',
    'ns_host/turn.baml',
    'ns_host/clients.baml',
  ];
  const sourceRoots = [
    '/tmp/a-different-and-longer-checkout/packages/api/baml_src',
    '/app/packages/api/baml_src',
  ];
  const normalized = sourceRoots.map((sourceRoot) => {
    const bytecode = Buffer.concat([
      Buffer.from([9, 8, 7]),
      ...relativePaths.flatMap((relative) => [
        framed(`${sourceRoot}/${relative}`),
        Buffer.from([0, 1, 2]),
      ]),
    ]);
    return normalizeBamlSourcePaths(renderModule(bytecode), sourceRoot);
  });

  assert.ok(normalized.every((result) => result.replacements === relativePaths.length));
  assert.equal(normalized[0].text, normalized[1].text);
  assert.deepEqual(
    embeddedBamlSourcePaths(decodeBytecodeModule(normalized[0].text).bytes),
    relativePaths.map((relative) => `${CANONICAL_BAML_SOURCE_ROOT}/${relative}`),
  );
  assert.doesNotThrow(() => assertCanonicalBamlSourcePaths(normalized[0].text));

  const repeated = normalizeBamlSourcePaths(normalized[0].text, sourceRoots[0]);
  assert.equal(repeated.replacements, 0);
  assert.equal(repeated.text, normalized[0].text);
});

test('canonical assertion rejects a framed path from another checkout', () => {
  const nonCanonical = renderModule(framed('/app/packages/api/baml_src/ns_host/clients.baml'));

  assert.throws(() => assertCanonicalBamlSourcePaths(nonCanonical), /non-canonical/i);
});

test('committed bytecode contains all 31 source paths in canonical form', () => {
  const generated = readFileSync(INLINED_BYTECODE_FILE, 'utf8');
  const paths = assertCanonicalBamlSourcePaths(generated);
  const counts = Object.fromEntries(
    ['clients.baml', 'protocol.baml', 'turn.baml'].map((file) => [
      file,
      paths.filter((embedded) => embedded.endsWith(`/${file}`)).length,
    ]),
  );

  assert.deepEqual(counts, {
    'clients.baml': 6,
    'protocol.baml': 1,
    'turn.baml': 24,
  });
});

test('generator normalizes paths and verifier asserts canonical bytecode', () => {
  const generator = readFileSync(path.join(scriptsRoot, 'generate-baml.mjs'), 'utf8');
  const verifier = readFileSync(path.join(scriptsRoot, 'verify-baml-generated.mjs'), 'utf8');

  assert.match(generator, /normalizeBamlSourcePaths/);
  assert.match(verifier, /assertCanonicalGeneratedBamlSourcePaths/);
});
