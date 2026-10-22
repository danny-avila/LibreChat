import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, copyFile, rm } from 'node:fs/promises';

it('runs the built app without the repository or node_modules and stops on SIGTERM', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'channel-gateway-'));
  const token = 'standalone-gateway-test-credential';
  const paths: string[] = [];
  let received: () => void = () => {};
  const workReceived = new Promise<void>((resolve) => {
    received = resolve;
  });
  const server = createServer((req, res) => {
    expect(req.headers.authorization).toBe(`Bearer ${token}`);
    paths.push(req.url ?? '');
    res.setHeader('Content-Type', 'application/json');
    if (req.url?.endsWith('/settings')) {
      res.end(JSON.stringify({ config: { enabled: true, port: 0 }, installations: [] }));
    } else {
      res.end('null');
      received();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture listener');
  for (const file of await readdir(join(__dirname, '../dist'))) {
    if (file.endsWith('.cjs'))
      await copyFile(join(__dirname, '../dist', file), join(directory, file));
  }
  const child = spawn(process.execPath, [join(directory, 'main.cjs')], {
    cwd: directory,
    env: {
      CHANNEL_GATEWAY_TOKEN: token,
      CHANNEL_GATEWAY_API_URL: `http://127.0.0.1:${address.port}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stderr.on('data', (data) => {
    output += data.toString();
  });
  const exited = once(child, 'exit');
  try {
    await Promise.race([
      workReceived,
      exited.then(() => {
        throw new Error(output || 'Gateway exited before polling');
      }),
    ]);
    expect(paths).toEqual(['/api/channels/gateway/settings', '/api/channels/gateway/work']);
    child.kill('SIGTERM');
    expect(await exited).toEqual([0, null]);
    expect(output).toBe('');
  } finally {
    child.kill('SIGKILL');
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
}, 15000);
