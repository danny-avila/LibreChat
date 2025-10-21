import { test, expect, APIRequestContext } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

const resolveEnvPath = () => {
  const cwdEnv = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(cwdEnv)) {
    return cwdEnv;
  }
  const parentEnv = path.resolve(process.cwd(), '..', '.env');
  if (fs.existsSync(parentEnv)) {
    return parentEnv;
  }
  return undefined;
};

const envPath = resolveEnvPath();
if (envPath) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const repoRoot = path.resolve(__dirname, '..', '..');
const DATASET_PATH = path.resolve(repoRoot, 'scripts', 'supervisor_dataset.json');
const datasetRaw = fs.readFileSync(DATASET_PATH, 'utf-8');
const dataset: Array<{
  id: string;
  input: string;
  expected_keywords: string;
  agent_id?: string;
}> = JSON.parse(datasetRaw);

const SKU_REGEX = /(?:part\s*#\s*)?\d{2}-\d{2}-[0-9A-Za-z-]+/gi;
const STOP_WORDS = new Set(
  [
    'the',
    'and',
    'for',
    'with',
    'that',
    'this',
    'from',
    'your',
    'have',
    'will',
    'when',
    'into',
    'about',
    'there',
    'their',
    'would',
    'could',
    'should',
    'while',
    'where',
    'which',
    'piece',
    'parts',
    'thanks',
    'please',
    'customer',
    'customers',
    'we',
    'you',
    'them',
    'they',
  ].map((w) => w.toLowerCase()),
);

const baseUrl = process.env.SUPERVISOR_BASE_URL || process.env.BASE_URL || 'http://localhost:3080';
const loginPath = process.env.SUPERVISOR_LOGIN_PATH || '/api/auth/login';
const completionPath =
  process.env.SUPERVISOR_COMPLETION_PATH || '/api/agents/chat/agents';
const registerPath = process.env.SUPERVISOR_REGISTER_PATH || '/api/auth/register';
const defaultAgentId = process.env.SUPERVISOR_AGENT_ID || 'agent_woodland_supervisor';
const fixtureEmail =
  process.env.LIBRECHAT_EMAIL ||
  process.env.SUPERVISOR_EMAIL ||
  process.env.E2E_USER_EMAIL;
const fixturePassword =
  process.env.LIBRECHAT_PASSWORD ||
  process.env.SUPERVISOR_PASSWORD ||
  process.env.E2E_USER_PASSWORD;
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

if (!fixtureEmail || !fixturePassword) {
  throw new Error(
    'Supervisor regression spec requires LIBRECHAT_EMAIL and LIBRECHAT_PASSWORD (or SUPERVISOR_EMAIL/PASSWORD).',
  );
}

function joinUrl(base: string, relative?: string) {
  if (!relative) return base.replace(/\/$/, '');
  if (/^https?:\/\//i.test(relative)) return relative;
  if (relative.startsWith('/')) return `${base.replace(/\/$/, '')}${relative}`;
  return `${base.replace(/\/$/, '')}/${relative}`;
}

function extractImportantKeywords(text = '') {
  const matches: string[] = [];
  const seen = new Set<string>();
  (text.match(SKU_REGEX) || []).forEach((raw) => {
    const normalized = raw.replace(/\s+/g, '').toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      matches.push(raw.trim());
    }
  });
  return matches;
}

function extractGeneralKeywords(text = '', limit = 12) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const unique: string[] = [];
  for (const word of words) {
    if (STOP_WORDS.has(word)) continue;
    if (word.length <= 3 && !/\d/.test(word)) continue;
    if (unique.includes(word)) continue;
    unique.push(word)
    if (unique.length >= limit) break;
  }
  return unique;
}

function collectSegments(segment: unknown, acc: string[]) {
  if (!segment) {
    return;
  }
  if (typeof segment === 'string') {
    acc.push(segment);
    return;
  }
  if (Array.isArray(segment)) {
    segment.forEach((entry) => collectSegments(entry, acc));
    return;
  }
  if (typeof segment === 'object') {
    const record = segment as Record<string, unknown>;
    if (record.text) {
      acc.push(String(record.text));
    }
    if (record.content) {
      collectSegments(record.content, acc);
    }
    if (record.message) {
      collectSegments(record.message, acc);
    }
    if (record.data) {
      collectSegments(record.data, acc);
    }
    if (record.responseMessage) {
      collectSegments(record.responseMessage, acc);
    }
  }
}

function parseEventStreamAnswer(raw: string) {
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  let currentEvent = 'message';
  const segments: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event:')) {
      currentEvent = line.slice(6).trim();
      continue;
    }
    if (!line.startsWith('data:')) {
      continue;
    }
    const payloadText = line.slice(5).trim();
    if (!payloadText || payloadText === '[DONE]') {
      continue;
    }
    try {
      const payload = JSON.parse(payloadText);
      if (currentEvent === 'error') {
        collectSegments(payload, segments);
      } else {
        collectSegments(payload, segments);
      }
    } catch {
      collectSegments(payloadText, segments);
    }
  }
  return segments.join(' ').trim();
}

test.describe.configure({ mode: 'serial' });

test.describe('Woodland supervisor regression', () => {
  let api: APIRequestContext;
  let token = '';
  let cookies = '';

  test.beforeAll(async ({ request, playwright }) => {
    const loginUrl = joinUrl(baseUrl, loginPath);
    const loginResponse = await request.post(loginUrl, {
      data: { email: fixtureEmail, password: fixturePassword },
      headers: {
        'User-Agent': BROWSER_UA,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    let responseToUse = loginResponse;

    if (loginResponse.status() === 404) {
      console.warn('[supervisor] Login returned 404; attempting registration before retrying login.');
      const registerUrl = joinUrl(baseUrl, registerPath);
      const registerResponse = await request.post(registerUrl, {
        data: {
          email: fixtureEmail,
          password: fixturePassword,
          confirm_password: fixturePassword,
          name: process.env.SUPERVISOR_REGISTER_NAME || 'Supervisor Regression',
        },
        headers: {
          'User-Agent': BROWSER_UA,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });
      if (!registerResponse.ok()) {
        const registerBody = await registerResponse.text();
        throw new Error(
          `Registration failed (${registerResponse.status()}): ${registerBody || '[empty body]'}`,
        );
      }
      const retry = await request.post(loginUrl, {
        data: { email: fixtureEmail, password: fixturePassword },
        headers: {
          'User-Agent': BROWSER_UA,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });
      responseToUse = retry;
    }

    if (!responseToUse.ok()) {
      const bodyText = await responseToUse.text();
      throw new Error(
        `Login failed (${responseToUse.status()}): ${bodyText || '[empty body]'} — ensure LIBRECHAT_EMAIL/PASSWORD are valid and the server allows API auth.`,
      );
    }

    const body = await responseToUse.json();
    token = body.token;
    expect(token, 'login response token').toBeTruthy();

    const setCookie = loginResponse.headers()['set-cookie'];
    if (Array.isArray(setCookie)) {
      cookies = setCookie.map((c) => c.split(';')[0]).filter(Boolean).join('; ');
    } else if (typeof setCookie === 'string') {
      cookies = setCookie.split(';')[0];
    }

    api = await playwright.request.newContext({
      baseURL: baseUrl,
      extraHTTPHeaders: {
        Authorization: `Bearer ${token}`,
        'User-Agent': BROWSER_UA,
        Accept: 'application/json,text/event-stream',
        'Content-Type': 'application/json',
        ...(cookies ? { Cookie: cookies } : {}),
      },
    });
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  for (const row of dataset) {
    const { id, input, expected_keywords: expected, agent_id: agentId } = row;
    if (!input) {
      continue;
    }

    test(`${id}`, async () => {
      const now = new Date().toISOString();
      const payload = {
        text: input,
        sender: 'User',
        clientTimestamp: now,
        isCreatedByUser: true,
        parentMessageId: randomUUID(),
        conversationId: randomUUID(),
        messageId: randomUUID(),
        error: false,
        endpoint: 'agents',
        agentId: agentId || defaultAgentId,
        key: now,
        isTemporary: false,
        isRegenerate: false,
        isContinued: false,
        responseMessageId: null,
        agent_id: agentId || defaultAgentId,
        ephemeralAgent: {
          execute_code: false,
          web_search: false,
          file_search: false,
          artifacts: false,
          mcp: [],
        },
      };

      const response = await api.post(completionPath, {
        data: payload,
        timeout: Number(process.env.SUPERVISOR_REQUEST_TIMEOUT || 25_000),
      });

      expect(response.ok(), `${id} request ok`).toBeTruthy();

      const contentType = response.headers()['content-type'] || '';
      const textBody = await response.text();
      let content = '';

      if (contentType.includes('application/json') || textBody.trim().startsWith('{')) {
        const data = JSON.parse(textBody);
        const segments: string[] = [];
        collectSegments(data?.choices?.[0]?.message?.content, segments);
        if (segments.length === 0 && typeof data?.choices?.[0]?.message?.content === 'string') {
          segments.push(data.choices[0].message.content);
        }
        content = segments.join(' ').trim();
      } else if (
        contentType.includes('text/event-stream') ||
        textBody.trim().startsWith('event:')
      ) {
        content = parseEventStreamAnswer(textBody);
      } else {
        throw new Error(`Unexpected supervisor response format (${contentType})`);
      }

      expect(content, `${id} supervisor content`).toBeTruthy();

      const normalizedAnswer = content.toLowerCase();
      const partKeywords = extractImportantKeywords(expected);
      const generalKeywords = extractGeneralKeywords(expected);

      const skuMatch =
        partKeywords.length === 0 ||
        partKeywords.every((keyword) =>
          normalizedAnswer.includes(keyword.replace(/\s+/g, '').toLowerCase()),
        );
      const matchedGeneral = generalKeywords.filter((kw) => normalizedAnswer.includes(kw)).length;
      const generalMatch = generalKeywords.length === 0 || matchedGeneral > 0;

      if (!(skuMatch && generalMatch)) {
        console.error(`\n[${id}] Expected keywords not found. Answer:\n${content}\n`);
        console.error(`Part keywords: ${JSON.stringify(partKeywords)} / matched: ${skuMatch}`);
        console.error(
          `General keywords: ${JSON.stringify(generalKeywords)} / matched count: ${matchedGeneral}`,
        );
      }

      expect(
        skuMatch && generalMatch,
        `Expected supervisor answer to include keywords for ${id}`,
      ).toBeTruthy();
    });
  }
});
