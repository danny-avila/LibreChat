import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, open, writeFile, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { chromium, expect } from '@playwright/test';

const live = process.argv.includes('--live');
const smoke = live ? dotenv.parse(await readFile(process.env.LIBRECHAT_SMOKE_ENV)) : {};
const chatModel = live ? 'gpt-5.6-terra' : 'gpt-4o-mini';
const reviewerModel = live ? 'gpt-5.6-luna' : 'review-only-model';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = await mkdtemp('/private/tmp/librechat-auto-review-');
const children = [];
const requests = [];
const executed = [];
let mongo;
let browser;
const ua = 'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36';
const password = 'ValidationPassword123!';
const email = 'review-local@example.com';
const log = await open(path.join(dir, 'server.log'), 'a', 0o600);
const provider = http.createServer(async (req, res) => {
  let raw = '';
  for await (const part of req) raw += part;
  const body = raw ? JSON.parse(raw) : {};
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/v1/models') {
    res.end(JSON.stringify({ data: [{ id: chatModel }] }));
    return;
  }
  if (live && (req.url.includes('/chat/completions') || req.url.includes('/responses'))) {
    requests.push({ model: body.model });
    const response = await fetch('https://api.openai.com' + req.url, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${smoke.OPENAI_API_KEY}`,
      },
      body: raw,
    });
    if (!response.ok) {
      const error = await response.text();
      console.log('Provider response:', response.status, error);
      res.writeHead(response.status);
      res.end(error);
      return;
    }
    res.setHeader('Content-Type', response.headers.get('content-type'));
    for await (const chunk of response.body) res.write(chunk);
    res.end();
    return;
  }
  if (req.url.includes('/chat/completions')) {
    requests.push(body);
    const scenario = JSON.stringify(body).includes('printf review-resumed')
      ? 'allow'
      : /REVIEW_CASE:(\w+)/.exec(JSON.stringify(body))?.[1];
    if (scenario === 'timeout') return;
    if (scenario === 'failure') {
      res.writeHead(429);
      res.end('{"error":{"message":"fixture rate limit"}}');
      return;
    }
    const content =
      scenario === 'invalid'
        ? 'invalid JSON'
        : JSON.stringify({
            outcome: { deny: 'deny', ask: 'ask' }[scenario] ?? 'allow',
            risk_level: scenario === 'deny' ? 'critical' : 'low',
            user_authorization: 'high',
            rationale: 'Local acceptance review.',
          });
    res.end(
      JSON.stringify({
        id: randomUUID(),
        object: 'chat.completion',
        model: body.model,
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 80, completion_tokens: 30, total_tokens: 110 },
      }),
    );
    return;
  }
  if (req.url === '/v1/workspace-tools/execute') {
    /** Only the fixture's exact harmless print can cross this test execution boundary. */
    assert.match(body.command, /^printf review-\w+$/);
    executed.push(body.command);
    await writeFile(path.join(dir, `executed-${executed.length}.txt`), body.command);
    res.end(
      JSON.stringify({
        protocolVersion: 1,
        operation: 'execute_command',
        workspaceId: 'workspace',
        exitCode: 0,
        stdout: body.command,
        stderr: '',
        truncated: false,
        timedOut: false,
      }),
    );
    return;
  }
  if (req.url.includes('/bridge/workers/worker/status')) {
    res.end(
      JSON.stringify({
        protocolVersion: 1,
        workerId: 'worker',
        online: true,
        ready: true,
        leaseExpiresInMs: 45000,
        capabilities: {
          statefulWorkspace: true,
          sandboxProfile: 'fixture',
          runtimes: ['bash'],
          workspaceTools: {
            protocolVersion: 1,
            operations: ['read_file', 'execute_command'],
            workspaces: [{ id: 'workspace', name: 'Test workspace' }],
          },
        },
      }),
    );
    return;
  }
  if (req.url.includes('health')) {
    res.end('{"status":"ok"}');
    return;
  }
  if (req.url.includes('/files/')) {
    res.end('{"files":[]}');
    return;
  }
  res.writeHead(404);
  res.end('{}');
});
await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
const fixtureURL = `http://127.0.0.1:${provider.address().port}/v1`;
const portServer = net.createServer();
await new Promise((resolve) => portServer.listen(0, '127.0.0.1', resolve));
const port = portServer.address().port;
await new Promise((resolve) => portServer.close(resolve));
const baseURL = `http://127.0.0.1:${port}`;
let token;
async function api(route, body, method = 'POST') {
  const response = await fetch(baseURL + route, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': ua,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  assert.ok(response.ok, `${route}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : undefined;
}
async function stream(streamId, ignoredActionId) {
  const response = await fetch(`${baseURL}/api/agents/chat/stream/${streamId}`, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': ua },
    signal: AbortSignal.timeout(120000),
  });
  let buffer = '';
  for await (const part of response.body) {
    buffer += Buffer.from(part).toString();
    let end;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');
      if (!data || data === '[DONE]') continue;
      const event = JSON.parse(data);
      await writeFile(path.join(dir, 'frames.log'), frame + '\n', { flag: 'a' });
      if (
        ignoredActionId &&
        event.event === 'on_pending_action' &&
        event.data?.actionId === ignoredActionId
      )
        continue;
      if (event.error) throw new Error(JSON.stringify(event));
      if (
        event.event === 'on_pending_action' ||
        event.final ||
        event.pendingAction ||
        /event:.*(?:approval|paused)/.test(frame)
      )
        return event;
    }
  }
  throw new Error('No final or approval event');
}
try {
  mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', dbName: 'auto-review' } });
  const config = {
    version: '1.3.16',
    endpoints: {
      openAI: { titleConvo: false },
      agents: {
        capabilities: ['tools', 'execute_code', 'stateful_code_sessions'],
        toolApproval: {
          enabled: true,
          mode: 'bypass',
          reviewer: {
            endpoint: live ? 'openAI' : 'Reviewer',
            model: reviewerModel,
            timeoutMs: live ? 30000 : 31000,
          },
        },
        statefulCodeSessions: {
          allowedEnvironments: ['conversation'],
          environments: [
            {
              id: 'local',
              name: 'Local review machine',
              type: 'attached',
              baseURL: fixtureURL,
              default: true,
              pairing: { workerId: 'worker', tokenEnv: 'REVIEW_BRIDGE_TOKEN' },
              configSchema: {
                permissions: {
                  fileWrite: { allowed: ['ask', 'allow', 'deny'], default: 'ask' },
                  commandExecution: { allowed: ['ask', 'allow', 'deny'], default: 'ask' },
                },
              },
            },
          ],
        },
      },
      custom: [
        {
          name: 'Reviewer',
          apiKey: 'local-fixture-key',
          baseURL: fixtureURL,
          models: { default: ['review-only-model'], fetch: false },
          titleConvo: false,
        },
      ],
    },
  };
  const configPath = path.join(dir, 'librechat.yaml');
  await writeFile(configPath, JSON.stringify(config));
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    NODE_ENV: 'CI',
    HOST: '127.0.0.1',
    PORT: String(port),
    MONGO_URI: mongo.getUri(),
    CONFIG_PATH: configPath,
    DOMAIN_CLIENT: baseURL,
    DOMAIN_SERVER: baseURL,
    CREDS_KEY: randomBytes(32).toString('hex'),
    CREDS_IV: randomBytes(16).toString('hex'),
    JWT_SECRET: randomBytes(32).toString('hex'),
    JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
    LIBRECHAT_CODE_API_KEY: 'local-code-fixture',
    LIBRECHAT_CODE_BASEURL: fixtureURL,
    OPENAI_API_KEY: 'local-chat-fixture',
    OPENAI_MODELS: 'gpt-4o-mini',
    OPENAI_REVERSE_PROXY: fixtureURL,
    REVIEW_BRIDGE_TOKEN: 'local-bridge-fixture',
    LIBRECHAT_TEST_RUN_HOOK: path.join(root, 'e2e/auto-review/model.cjs'),
    SEARCH: 'false',
    USE_REDIS: 'false',
    USE_REDIS_STREAMS: 'false',
    CHECK_BALANCE: 'false',
    NO_INDEX: 'true',
    ALLOW_REGISTRATION: 'true',
    ALLOW_SOCIAL_LOGIN: 'false',
    TITLE_CONVO: 'false',
    SCHEDULES_SINGLE_PROCESS: 'true',
    ENDPOINTS: 'agents,openAI,custom',
    LIMIT_CONCURRENT_MESSAGES: 'false',
    LIMIT_MESSAGE_IP: 'false',
    LIMIT_MESSAGE_USER: 'false',
    LOGIN_VIOLATION_SCORE: '0',
    REGISTRATION_VIOLATION_SCORE: '0',
    NON_BROWSER_VIOLATION_SCORE: '0',
  };
  if (live) {
    assert.ok(smoke.OPENAI_API_KEY);
    env.OPENAI_API_KEY = smoke.OPENAI_API_KEY;
    env.OPENAI_MODELS = chatModel;
    env.OPENAI_REVERSE_PROXY = fixtureURL;
    delete env.LIBRECHAT_TEST_RUN_HOOK;
  }
  const app = spawn(process.execPath, ['api/server/index.js'], {
    cwd: root,
    env,
    stdio: ['ignore', log.fd, log.fd],
  });
  children.push(app);
  const deadline = Date.now() + 90000;
  while (true) {
    assert.equal(app.exitCode, null, `Server exited; inspect ${dir}`);
    try {
      if ((await fetch(baseURL + '/readyz')).ok) break;
    } catch {
      // The server may not have bound its port yet.
    }
    assert.ok(Date.now() < deadline, `Startup timeout; inspect ${dir}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await api('/api/auth/register', {
    email,
    name: 'Local review',
    password,
    confirm_password: password,
  });
  token = (await api('/api/auth/login', { email, password })).token;
  const agent = await api('/api/agents', {
    name: 'Auto review acceptance',
    provider: 'openAI',
    model: chatModel,
    model_parameters: live ? { useResponsesApi: true, reasoning_effort: 'low' } : undefined,
    instructions: 'Follow the user request.',
    tools: ['execute_code'],
    stateful_code_sessions: true,
    stateful_code_environment: 'conversation',
    code_environment_id: 'local',
  });
  const results = [];
  for (const scenario of live
    ? ['allow']
    : ['allow', 'deny', 'ask', 'invalid', 'failure', 'timeout']) {
    const before = executed.length;
    const beforeReviews = requests.length;
    const chatBody = {
      text: `REVIEW_CASE:${scenario} Run exactly this bash command once: printf review-${scenario}. Then report the output.`,
      sender: 'User',
      isCreatedByUser: true,
      parentMessageId: '00000000-0000-0000-0000-000000000000',
      conversationId: null,
      messageId: randomUUID(),
      endpoint: 'agents',
      model: agent.id,
      agent_id: agent.id,
      codeApprovalMode: 'auto',
      codeEnvironmentMode: 'attached',
      codeWorkspaces: [{ environmentId: 'local', workspaceId: 'workspace' }],
      timezone: 'UTC',
    };
    const started = await api('/api/agents/chat', chatBody);
    const event = await stream(started.streamId);
    await writeFile(
      path.join(dir, `${scenario}.json`),
      JSON.stringify({ started, event }, null, 2),
    );
    assert.equal(executed.length - before, scenario === 'allow' ? 1 : 0, `${scenario} execution`);
    if (!live)
      assert.equal(requests.length - beforeReviews, 1, `${scenario} reviewer calls (no retries)`);
    if (!live) assert.equal(requests.at(-1).model, reviewerModel);
    else
      assert.ok(
        requests.some((request) => request.model === reviewerModel),
        'Separate Luna review request',
      );
    if (scenario === 'ask') {
      const pending = event.data;
      await api('/api/agents/chat/resume', {
        ...chatBody,
        conversationId: started.conversationId,
        actionId: pending.actionId,
        generationCreatedAt: started.generationCreatedAt,
        decisions: pending.payload.action_requests.map((action) => ({
          tool_call_id: action.tool_call_id,
          decision: 'approve',
        })),
      });
      const resumed = await stream(started.streamId, pending.actionId);
      await writeFile(path.join(dir, 'resumed.json'), JSON.stringify(resumed, null, 2));
      assert.equal(
        executed.length - before,
        2,
        'approved action and new auto-reviewed action execute',
      );
      assert.equal(
        requests.length - beforeReviews,
        3,
        'paused action rechecked and new action reviewed after checkpoint resume',
      );
    }
    results.push({ scenario, executed: executed.length - before, streamId: started.streamId });
  }
  const frames = await readFile(path.join(dir, 'frames.log'), 'utf8');
  assert.ok(frames.includes('"usage_type":"auto-review"'), 'Reviewer usage recorded separately');
  if (live) assert.ok(frames.includes('gpt-5.6-luna'), 'Luna reviewer usage');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  await page.goto(baseURL + '/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByTestId('login-button').click();
  await expect(page).toHaveURL(/\/c\/new/, { timeout: 30000 });
  await page.goto(baseURL + '/c/' + results[0].streamId);
  const selector = page.getByTestId('code-approval-mode');
  await expect(selector).toContainText('Auto review', { timeout: 30000 });
  await selector.click();
  await page.getByRole('menuitemradio', { name: /Ask before changes/ }).click();
  await expect(selector).toContainText('Ask before changes');
  await selector.click();
  await page.getByRole('menuitemradio', { name: /Auto review/ }).click();
  await expect(selector).toContainText('Auto review');
  await page.screenshot({ path: path.join(dir, 'auto-review.png'), fullPage: true });
  /** Exercise the existing drive skill's login/chat/SSE/persistence/feedback path. */
  if (process.env.LIBRECHAT_DRIVE_SCRIPT) {
    const dbClient = await MongoClient.connect(mongo.getUri());
    await dbClient
      .db()
      .collection('users')
      .updateOne({ email }, { $set: { tenantId: 'local' } });
    await dbClient.close();
    const drive = spawn(
      process.execPath,
      [
        process.env.LIBRECHAT_DRIVE_SCRIPT,
        '--base-url',
        baseURL,
        '--tenant',
        `local=${email}`,
        '--password',
        password,
        '--model',
        chatModel,
      ],
      { cwd: root, env, stdio: 'inherit' },
    );
    assert.equal(await new Promise((resolve) => drive.once('exit', resolve)), 0);
  }
  console.log(JSON.stringify({ results, evidence: dir }, null, 2));
} finally {
  await browser?.close();
  for (const child of children) {
    if (child.exitCode !== null) continue;
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
  provider.closeAllConnections();
  await new Promise((resolve) => provider.close(resolve));
  await mongo?.stop();
  await log.close();
  console.log(`Local evidence: ${dir}`);
}
