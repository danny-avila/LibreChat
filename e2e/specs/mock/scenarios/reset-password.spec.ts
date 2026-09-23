import fs from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const PASSWORD = 'test1234!';
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const NO_AUTO_INDEX = path.join(__dirname, 'no-auto-index.cjs');

type RuntimeEnv = { MONGO_URI?: string };

function getMongoUri(): string {
  const runtimeEnvPath =
    process.env.E2E_RUNTIME_ENV_PATH ??
    path.resolve(__dirname, '../../.test-results/runtime-env.json');
  try {
    const env = JSON.parse(fs.readFileSync(runtimeEnvPath, 'utf8')) as RuntimeEnv;
    if (env.MONGO_URI) {
      return env.MONGO_URI;
    }
  } catch {
    /* fall through to env */
  }
  return process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/LibreChat-e2e';
}

/**
 * Drives the interactive reset CLI the way an administrator would, answering
 * each prompt as it appears rather than pre-loading stdin, which the prompt
 * loop would consume as one burst.
 */
function runResetCli(
  email: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn('node', ['config/reset-password.js'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      MONGO_URI: getMongoUri(),
      /** The harness server already built the indexes; skip the module-scope rebuild. */
      NODE_OPTIONS: process.env.NODE_OPTIONS
        ? `${process.env.NODE_OPTIONS} --require ${NO_AUTO_INDEX}`
        : `--require ${NO_AUTO_INDEX}`,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const answers: Array<[string, string] | null> = [
    ['Enter user email: ', email],
    ['Enter new password: ', 'fresh-password-1'],
    ['Confirm new password: ', 'fresh-password-1'],
  ];
  let stdout = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
    answers.forEach((answer, index) => {
      if (answer !== null && stdout.includes(answer[0])) {
        child.stdin?.write(`${answer[1]}\n`);
        answers[index] = null;
      }
    });
  });
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`reset CLI timed out; stdout: ${stdout.slice(-400)}`));
    }, 60_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      child.stdin?.end();
      resolve({ code, stdout, stderr });
    });
  });
}

test.describe('CLI password reset', () => {
  test('a bearer minted before a CLI password reset stops authorizing immediately @scenario:cli-reset-revokes-old-tokens', async ({
    playwright,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    const request = await playwright.request.newContext({ baseURL });
    const email = `cli-reset-${randomUUID().slice(0, 8)}@example.com`;

    const register = await request.post('/api/auth/register', {
      data: { email, name: 'CLI Reset', password: PASSWORD, confirm_password: PASSWORD },
    });
    expect(register.ok()).toBeTruthy();
    const login = await request.post('/api/auth/login', {
      data: { email, password: PASSWORD },
    });
    expect(login.ok()).toBeTruthy();
    const { token } = (await login.json()) as { token: string };
    const authorized = await request.get('/api/user', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(authorized.ok()).toBeTruthy();
    await request.dispose();

    const cli = await runResetCli(email);
    expect(cli.stdout, `reset CLI stderr: ${cli.stderr.slice(-400)}`).toContain(
      'Password successfully reset!',
    );

    const fresh = await playwright.request.newContext({ baseURL });
    const rejected = await fresh.get('/api/user', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(rejected.status()).toBe(401);
    await fresh.dispose();
  });
});
