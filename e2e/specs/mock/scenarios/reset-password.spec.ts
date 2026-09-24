import fs from 'fs';
import path from 'path';
import os from 'os';
import { Keyv } from 'keyv';
import KeyvRedis from '@keyv/redis';
import { expect, test } from '@playwright/test';
import { AUTH_USER_DOC_BY_ID_PREFIX, CacheKeys } from 'librechat-data-provider';
import { spawn } from 'node:child_process';
import { randomInt, randomUUID } from 'node:crypto';
import { withMongo, seedPasskey, deleteUserByEmail } from '../db';

const PASSWORD = 'test1234!';
const NEW_PASSWORD = 'fresh-password-1';
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
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [path.join(REPO_ROOT, 'config/reset-password.js')], {
    cwd,
    env: {
      ...env,
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
    ['Enter new password: ', NEW_PASSWORD],
    ['Confirm new password: ', NEW_PASSWORD],
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
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      child.stdin?.end();
      resolve({ code, stdout, stderr });
    });
  });
}

test.describe('CLI password reset', () => {
  test.skip(process.env.E2E_STREAM_STORE !== 'redis', 'Runs in the Redis integration lane');
  for (const [source, scenario] of [
    ['environment', '@scenario:cli-reset-revokes-old-tokens'],
    ['dotenv', '@scenario:cli-reset-loads-cache-env'],
  ]) {
    test(`evicts cached credentials with ${source} configuration ${scenario}`, async ({
      playwright,
      baseURL,
    }) => {
      test.setTimeout(90_000);
      // The harness trusts one proxy; isolate each scenario's login rate-limit budget.
      const request = await playwright.request.newContext({
        baseURL,
        extraHTTPHeaders: {
          'X-Forwarded-For': `127.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`,
        },
      });
      const email = `cli-reset-${randomUUID().slice(0, 8)}@example.com`;
      const expiresAt = source === 'dotenv' ? new Date(Date.now() + 604800_000) : undefined;
      const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-reset-'));
      const redisUri = process.env.REDIS_URI ?? 'redis://127.0.0.1:6379';
      const prefix = `cli-reset-${randomUUID()}`;
      const adapter = new KeyvRedis(redisUri, { throwOnErrors: true, connectionTimeout: 5000 });
      // Match standardCache's namespace layering without initializing app singletons in this worker.
      const cache = new Keyv(adapter, { namespace: CacheKeys.AUTH_USER_DOC });
      adapter.namespace = prefix;
      adapter.keyPrefixSeparator = '::';
      const keys: string[] = [];
      try {
        const register = await request.post('/api/auth/register', {
          data: { email, name: 'CLI Reset', password: PASSWORD, confirm_password: PASSWORD },
        });
        expect(register.ok()).toBeTruthy();
        const login = await request.post('/api/auth/login', {
          data: { email, password: PASSWORD },
        });
        expect(login.ok()).toBeTruthy();
        const { token, user } = (await login.json()) as { token: string; user: { _id: string } };
        const authorized = await request.get('/api/user', {
          headers: { Authorization: `Bearer ${token}` },
        });
        expect(authorized.ok()).toBeTruthy();
        await seedPasskey(email, randomUUID(), 'Reset regression');
        await withMongo(async (db) => {
          if (expiresAt) {
            await db
              .collection('users')
              .updateOne({ email }, { $set: { expiresAt, emailVerified: false } });
          }
          const resetUser = await db.collection('users').findOne({ email });
          expect(await db.collection('passkeys').countDocuments({ user: resetUser!._id })).toBe(1);
          expect(
            await db.collection('sessions').countDocuments({ user: resetUser!._id }),
          ).toBeGreaterThan(0);
        });
        const indexKey = `${AUTH_USER_DOC_BY_ID_PREFIX}:${user._id}`;
        const documentKeys = ['first', 'second'].map((suffix) => `auth-user-doc:${suffix}`);
        const controlKey = 'auth-user-doc:another-user';
        keys.push(indexKey, ...documentKeys, controlKey);
        // Keep fixtures alive beyond the test deadline so expiry cannot masquerade as eviction.
        await cache.set(indexKey, documentKeys, 120_000);
        for (const key of [...documentKeys, controlKey]) {
          await cache.set(key, { credentialsChangedAt: null }, 120_000);
          expect(await cache.get(key)).toEqual({ credentialsChangedAt: null });
        }
        expect(await cache.get(indexKey)).toEqual(documentKeys);

        const config = {
          USE_REDIS: 'true',
          USE_REDIS_CLUSTER: 'false',
          REDIS_URI: redisUri,
          REDIS_KEY_PREFIX: prefix,
          REDIS_KEY_PREFIX_VAR: '',
          AUTH_USER_CACHE_MODE: 'on',
          FORCED_IN_MEMORY_CACHE_NAMESPACES: '',
        };
        const env = { ...process.env };
        for (const key of Object.keys(config)) {
          delete env[key];
        }
        if (source === 'dotenv') {
          fs.writeFileSync(
            path.join(cwd, '.env'),
            Object.entries(config)
              .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
              .join('\n'),
            { mode: 0o600 },
          );
        } else {
          Object.assign(env, config);
        }

        const cli = await runResetCli(email, cwd, env);
        expect(cli.code, cli.stderr.slice(-400)).toBe(0);
        expect(cli.stdout, `reset CLI stderr: ${cli.stderr.slice(-400)}`).toContain(
          'Password successfully reset!',
        );
        expect(await cache.get(indexKey)).toBeUndefined();
        for (const key of documentKeys) {
          expect(await cache.get(key), `stale auth cache entry: ${key}`).toBeUndefined();
        }
        expect(await cache.get(controlKey)).toEqual({ credentialsChangedAt: null });
        await withMongo(async (db) => {
          const resetUser = await db.collection('users').findOne({ email });
          expect(resetUser?.credentialsChangedAt).toBeTruthy();
          expect(resetUser?.expiresAt).toEqual(expiresAt);
          if (expiresAt) {
            expect(resetUser?.emailVerified).toBe(false);
          }
          expect(await db.collection('passkeys').countDocuments({ user: resetUser!._id })).toBe(0);
          expect(await db.collection('sessions').countDocuments({ user: resetUser!._id })).toBe(0);
        });

        const rejected = await request.get('/api/user', {
          headers: { Authorization: `Bearer ${token}` },
        });
        expect(rejected.status()).toBe(401);
        const oldLogin = await request.post('/api/auth/login', {
          data: { email, password: PASSWORD },
        });
        expect(oldLogin.status()).toBe(404);
        const newLogin = await request.post('/api/auth/login', {
          data: { email, password: NEW_PASSWORD },
        });
        expect(newLogin.ok()).toBeTruthy();
      } finally {
        try {
          await Promise.all(keys.map((key) => cache.delete(key)));
        } finally {
          await cache.disconnect();
          await request.dispose();
          fs.rmSync(cwd, { recursive: true, force: true });
          await deleteUserByEmail(email);
        }
      }
    });
  }
});
