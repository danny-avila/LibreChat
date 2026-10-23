import assert from 'node:assert/strict';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const recipes = [
  ['docker-compose.yml'],
  ['deploy-compose.yml'],
  ['.devcontainer/docker-compose.yml'],
  ['docker-compose.yml', 'docker-compose.langfuse-fanout.yml'],
  ['deploy-compose.yml', 'deploy-compose.langfuse-fanout.yml'],
];
for (const files of recipes) {
  test(`default isolated extraction in ${files.join(' + ')}`, () => {
    const scratch = mkdtempSync(join(tmpdir(), 'extraction-compose-'));
    const envFile = join(scratch, '.env');
    writeFileSync(envFile, '');
    try {
      // Render the recipes verbatim beside synthetic env files, never the application's .env.
      for (const file of files) {
        const staged = join(scratch, file);
        mkdirSync(dirname(staged), { recursive: true });
        copyFileSync(join(root, file), staged);
      }
      const rendered = execFileSync(
        'docker',
        [
          'compose',
          '--env-file',
          envFile,
          ...files.flatMap((file) => ['-f', file]),
          'config',
          '--format',
          'json',
        ],
        {
          cwd: scratch,
          encoding: 'utf8',
          env: {
            PATH: process.env.PATH,
            PORT: '3080',
            UID: '1000',
            GID: '1000',
            ADMIN_PANEL_SESSION_SECRET: 'test-only',
            MEILI_MASTER_KEY: 'test-only',
            LANGFUSE_FANOUT_CENTRAL_AUTH_HEADER: 'test-only',
          },
        },
      );
      const { services, volumes } = JSON.parse(rendered);
      const processor = services.extraction;
      assert.ok(processor, 'processor must be included without overlay or profile');
      assert.equal(processor.profiles, undefined);
      assert.equal(processor.pull_policy, 'build');
      assert.equal(
        processor.build.context,
        'https://github.com/LibreChat-AI/code-interpreter.git#77bcd2ec2e63be523bfab2dfa11159a2ceec0088',
      );
      assert.equal(processor.build.dockerfile, 'packages/extraction/Dockerfile');
      assert.equal(processor.build.target, 'runtime');
      assert.equal(processor.network_mode, 'none');
      assert.equal(processor.read_only, true);
      assert.equal(processor.user, '10001:10001');
      assert.equal(processor.init, true);
      assert.deepEqual(processor.cap_drop, ['ALL']);
      assert.deepEqual(processor.security_opt, ['no-new-privileges:true']);
      assert.equal(Number(processor.mem_limit), 768 * 1024 * 1024);
      assert.equal(Number(processor.cpus), 2);
      assert.equal(processor.pids_limit, 32);
      assert.equal(processor.ports, undefined);
      assert.equal(processor.environment, undefined);
      assert.equal(processor.command ?? undefined, undefined);
      assert.equal(processor.entrypoint ?? undefined, undefined);
      assert.equal(processor.volumes.length, 1);
      assert.equal(processor.volumes[0].source, 'extraction-socket');
      assert.equal(processor.volumes[0].target, '/socket');
      assert.ok(
        processor.tmpfs.some(
          (mount) =>
            mount.startsWith('/jobs:') &&
            [
              'noexec',
              'nosuid',
              'nodev',
              'size=96m',
              'nr_inodes=1024',
              'uid=10001',
              'gid=10001',
              'mode=0700',
            ].every((flag) => mount.includes(flag)),
        ),
      );
      assert.ok(volumes['extraction-socket']);
      for (const name of services.app ? ['app'] : ['api', 'rag_api']) {
        const caller = services[name];
        assert.ok(caller.group_add.map(String).includes('10001'));
        assert.equal(caller.depends_on.extraction.condition, 'service_healthy');
        const socket = caller.volumes.find((mount) => mount.target === '/socket');
        assert.equal(socket.source, 'extraction-socket');
        assert.equal(socket.read_only, true);
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
}
