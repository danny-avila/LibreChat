import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { build } from '../packages/api/node_modules/tsdown/dist/index.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = mkdtempSync(join(root, '.extraction-test-'));
chmodSync(scratch, 0o755);
const uuid = randomUUID();
const project = `librechat-extraction-test-${uuid}`;
const image = `librechat-extraction-test:${uuid}`;
const caller = `librechat-extraction-caller-${uuid}`;
const docker = (...args) => execFileSync('docker', args, { cwd: root, stdio: 'inherit' });
const output = (...args) => execFileSync('docker', args, { cwd: root, encoding: 'utf8' }).trim();
const composeFile = join(scratch, 'compose.json');
const compose = (...args) => docker('compose', '-p', project, '-f', composeFile, ...args);
let imageBuilt = false;
try {
  const overlay = yaml.load(readFileSync(join(root, 'docker-compose.extraction.yml'), 'utf8'));
  assert.deepEqual(overlay.services.api.group_add, ['10001']);
  assert.deepEqual(overlay.services.api.volumes, ['extraction-socket:/socket:ro']);
  // Select the shipped processor unchanged. No database/app services or environment files enter this test.
  writeFileSync(
    composeFile,
    JSON.stringify({
      services: { extraction: overlay.services.extraction },
      volumes: overlay.volumes,
    }),
  );
  process.env.EXTRACTION_IMAGE = image;
  await build({
    entry: [join(root, 'packages/api/src/files/extraction/client.ts')],
    config: false,
    outDir: scratch,
    clean: false,
    format: 'cjs',
    platform: 'node',
    dts: false,
    deps: { alwaysBundle: ['librechat-data-provider', 'zod'], onlyBundle: false },
  });
  compose('build', 'extraction');
  imageBuilt = true;
  compose('up', '-d', '--wait', '--wait-timeout', '30', 'extraction');
  const id = output('compose', '-p', project, '-f', composeFile, 'ps', '-q', 'extraction');
  const container = JSON.parse(output('inspect', id))[0];
  const host = container.HostConfig;
  assert.equal(host.NetworkMode, 'none');
  assert.equal(host.ReadonlyRootfs, true);
  assert.equal(host.Privileged, false);
  assert.deepEqual(host.CapDrop, ['ALL']);
  assert.ok(host.SecurityOpt.includes('no-new-privileges:true'));
  assert.equal(host.Memory, 768 * 1024 * 1024);
  assert.equal(host.NanoCpus, 2e9);
  assert.equal(host.PidsLimit, 32);
  assert.equal(container.Config.User, '10001:10001');
  assert.equal(container.Mounts.length, 1);
  assert.equal(container.Mounts[0].Destination, '/socket');
  assert.deepEqual(Object.keys(host.Tmpfs), ['/jobs']);
  for (const flag of [
    'noexec',
    'nosuid',
    'nodev',
    'size=96m',
    'nr_inodes=1024',
    'uid=10001',
    'gid=10001',
    'mode=0700',
  ]) {
    assert.ok(host.Tmpfs['/jobs'].includes(flag));
  }
  console.log(
    'Shipped processor network, mounts, identity, resource caps and security flags verified',
  );
  docker(
    'run',
    '--rm',
    '--name',
    caller,
    '--init',
    '--network',
    'none',
    '--read-only',
    '--user',
    '1000:1000',
    '--group-add',
    '10001',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '--mount',
    `type=volume,src=${project}_extraction-socket,dst=/socket,readonly`,
    '--mount',
    `type=bind,src=${scratch},dst=/test,readonly`,
    '--mount',
    `type=bind,src=${join(root, 'scripts/extraction-client.cjs')},dst=/client.cjs,readonly`,
    '--mount',
    `type=bind,src=${join(root, 'packages/api/src/files/extraction/fixtures')},dst=/fixtures,readonly`,
    '--entrypoint',
    'node',
    image,
    '/client.cjs',
  );
  docker(
    'exec',
    id,
    'node',
    '-e',
    'const fs=require("node:fs"); if(fs.readdirSync("/jobs").length) process.exit(1); console.log("Processor scratch cleanup verified");',
  );
} finally {
  try {
    compose('down', '-v', '--remove-orphans');
    if (imageBuilt) docker('image', 'rm', image);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
