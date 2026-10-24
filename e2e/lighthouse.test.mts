import path from 'node:path';
import { test } from 'node:test';
import { tmpdir } from 'node:os';
import { inspect } from 'node:util';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';

import { runLighthouse } from './lighthouse/process.mts';

for (const failures of [0, 1, 2]) {
  test(`Lighthouse reports ${failures} failed attempts without disclosing child payloads`, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'lighthouse-process-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const cli = path.join(directory, 'cli.cjs');
    const counter = path.join(directory, 'attempts');
    const secret = 'disposable-session-cookie-sentinel';
    const url = 'https://example.test/c/private-conversation';
    await writeFile(
      cli,
      `
      const fs = require('node:fs');
      const counter = ${JSON.stringify(counter)};
      const attempt = fs.existsSync(counter) ? Number(fs.readFileSync(counter, 'utf8')) + 1 : 1;
      fs.writeFileSync(counter, String(attempt));
      console.log(${JSON.stringify(secret)});
      console.error(process.argv.join(' '));
      console.error('Runtime error encountered: Trace failed (NO_NAVSTART)');
      process.exit(attempt <= ${failures} ? 1 : 0);
    `,
    );
    const logs: string[] = [];
    t.mock.method(console, 'log', (message: string) => logs.push(message));
    const running = runLighthouse({
      cli,
      flags: [url, `--extra-headers=${JSON.stringify({ Cookie: `refreshToken=${secret}` })}`],
      output: path.join(directory, 'lhr-1'),
      run: 1,
      runs: 3,
    });
    if (failures === 2) {
      await assert.rejects(running, (error: Error) => {
        assert.equal(error.message, 'Lighthouse process failed (exit 1, NO_NAVSTART).');
        assert.deepEqual(Object.getOwnPropertyNames(error), ['stack', 'message']);
        assert.ok(!inspect(error).includes(secret));
        assert.ok(!inspect(error).includes(url));
        return true;
      });
    } else {
      await running;
      assert.ok(logs.some((line) => line.endsWith('lhr-1.report.json')));
    }
    assert.equal(Number(await readFile(counter, 'utf8')), Math.min(failures + 1, 2));
    assert.equal(logs.filter((line) => line.includes('retrying')).length, failures === 0 ? 0 : 1);
    for (const line of logs) {
      assert.ok(!line.includes(secret));
      assert.ok(!line.includes(url));
      assert.ok(!line.includes('--extra-headers'));
      assert.ok(!line.includes('Command failed'));
    }
  });
}
