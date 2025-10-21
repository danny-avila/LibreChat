#!/usr/bin/env node
/**
 * Validate the Woodland supervisor agent using real LibreChat credentials.
 *
 * Example:
 *   node scripts/runSupervisorRegression.js \
 *     --base-url https://yourlibrechat-domain \
 *     --email user@example.com
 *
 * PROMPTED_FOR_PASSWORD environment variable: LIBRECHAT_PASSWORD.
 *
 * Dataset: scripts/langfuse_dataset_variables.json (array of rows with
 * `variables`, `expected_output`, `metadata`).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const process = require('process');
const { randomUUID } = require('crypto');

const DATASET_PATH = path.join(__dirname, 'supervisor_dataset.json');
const SESSION_CACHE_DIR = path.join(os.homedir(), '.wppagentlayer');
const SESSION_CACHE_FILE = path.join(SESSION_CACHE_DIR, 'supervisor-session.json');
const DEFAULT_SLEEP_MS = 200;
const DEFAULT_COMPLETION_PATH = '/api/openai/v1/chat/completions';
const DEFAULT_LOGIN_PATH = '/api/auth/login';
const DEFAULT_AGENT_ID = 'agent_woodland_supervisor';
const AUTH_RETRY_LIMIT = 5;
const MAX_UNAUTHORIZED_WITHOUT_REFRESH = 2;
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

function joinUrl(base, relative) {
  const normalizedBase = base.replace(/\/$/, '');
  if (!relative) {
    return normalizedBase;
  }
  if (relative.startsWith('http://') || relative.startsWith('https://')) {
    return relative;
  }
  if (relative.startsWith('/')) {
    return `${normalizedBase}${relative}`;
  }
  return `${normalizedBase}/${relative}`;
}

function extractImportantKeywords(text = '') {
  const matches = [];
  const seen = new Set();
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
  const unique = [];
  for (const word of words) {
    if (STOP_WORDS.has(word)) continue;
    if (word.length <= 3 && !/\d/.test(word)) continue;
    if (unique.includes(word)) continue;
    unique.push(word);
    if (unique.length >= limit) break;
  }
  return unique;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    baseUrl: null,
    email: null,
    password: process.env.LIBRECHAT_PASSWORD || null,
    sleep: DEFAULT_SLEEP_MS,
    completionPath: DEFAULT_COMPLETION_PATH,
    loginPath: DEFAULT_LOGIN_PATH,
    defaultAgentId: DEFAULT_AGENT_ID,
    dataset: DATASET_PATH,
    refreshOn401: false,
    jitter: 0,
    resumeFrom: null,
    runLogPath: null,
    skipHealthCheck: false,
    useSessionCache: true,
    sessionCachePath: SESSION_CACHE_FILE,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    switch (arg) {
      case '--base-url':
        parsed.baseUrl = next;
        i += 1;
        break;
      case '--email':
        parsed.email = next;
        i += 1;
        break;
      case '--password':
        parsed.password = next;
        i += 1;
        break;
      case '--dataset':
        parsed.dataset = next;
        i += 1;
        break;
      case '--completion-path':
        parsed.completionPath = next;
        i += 1;
        break;
      case '--login-path':
        parsed.loginPath = next;
        i += 1;
        break;
      case '--sleep':
        parsed.sleep = Number(next);
        i += 1;
        break;
      case '--agent-id':
        parsed.defaultAgentId = next;
        i += 1;
        break;
      case '--jitter':
        parsed.jitter = Number(next) || 0;
        i += 1;
        break;
      case '--resume-from':
        parsed.resumeFrom = next;
        i += 1;
        break;
      case '--run-log':
        parsed.runLogPath = next;
        i += 1;
        break;
      case '--session-cache':
        parsed.sessionCachePath = next;
        i += 1;
        break;
      case '--no-session-cache':
        parsed.useSessionCache = false;
        break;
      case '--refresh-token-on-401':
        parsed.refreshOn401 = true;
        break;
      case '--no-refresh-token-on-401':
        parsed.refreshOn401 = false;
        break;
      case '--skip-health-check':
        parsed.skipHealthCheck = true;
        break;
      default:
        break;
    }
  }

  if (!parsed.baseUrl || !parsed.email) {
    console.error(
      'Usage: node scripts/runSupervisorRegression.js --base-url <url> --email <user> [--password <pwd>] [--dataset <path>] [--sleep <ms>] [--agent-id <id>] [--jitter <ms>] [--resume-from <id>] [--run-log <file>] [--session-cache <path>] [--no-session-cache] [--refresh-token-on-401] [--skip-health-check]',
    );
    process.exit(1);
  }

  return parsed;
}

async function promptForPassword(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: true,
  });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const decodeJwtExpiry = (token) => {
  if (!token || typeof token !== 'string') {
    return null;
  }
  try {
    const [, payload] = token.split('.');
    if (!payload) {
      return null;
    }
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (decoded && typeof decoded.exp === 'number') {
      return decoded.exp * 1000;
    }
  } catch {
    return null;
  }
  return null;
};

const formatTtl = (ms) => {
  if (!Number.isFinite(ms)) {
    return 'unknown';
  }
  if (ms <= 0) {
    return 'expired';
  }
  if (ms < 1000) {
    return '<1s';
  }
  if (ms < 60_000) {
    return `${Math.round(ms / 1000)}s`;
  }
  const minutes = Math.round(ms / 60000);
  return `${minutes}m`;
};

const parseRetryAfterValue = (value) => {
  if (!value) {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isNaN(numeric) && numeric >= 0) {
    // Header is in seconds per RFC 7231
    return numeric * 1000;
  }

  const parsedDate = Date.parse(value);
  if (!Number.isNaN(parsedDate)) {
    const diff = parsedDate - Date.now();
    return diff > 0 ? diff : null;
  }

  return null;
};

const parseRetryAfterMessage = (text) => {
  if (!text) {
    return null;
  }

  const durationMatch = /after\s+(\d+)\s*(second|seconds|minute|minutes|hour|hours)/i.exec(text);
  if (!durationMatch) {
    return null;
  }

  const amount = Number(durationMatch[1]);
  if (Number.isNaN(amount) || amount <= 0) {
    return null;
  }

  const unit = durationMatch[2].toLowerCase();
  switch (unit) {
    case 'second':
    case 'seconds':
      return amount * 1000;
    case 'minute':
    case 'minutes':
      return amount * 60 * 1000;
    case 'hour':
    case 'hours':
      return amount * 60 * 60 * 1000;
    default:
      return null;
  }
};

async function performHealthChecks({ baseUrl, loginPath, completionPath, token, cookies, skip }) {
  if (skip) {
    return [];
  }

  const targets = [
    {
      name: 'base-url',
      url: joinUrl(baseUrl, '/'),
      init: { method: 'GET', headers: { 'User-Agent': BROWSER_UA } },
      ok: (status) => status >= 200 && status < 400,
    },
    {
      name: 'login-endpoint',
      url: joinUrl(baseUrl, loginPath),
      init: { method: 'GET', headers: { 'User-Agent': BROWSER_UA } },
      ok: (status) => status === 200 || status === 405 || status === 401,
    },
    {
      name: 'supervisor-endpoint',
      url: joinUrl(baseUrl, completionPath),
      init: {
        method: 'OPTIONS',
        headers: {
          'User-Agent': BROWSER_UA,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(cookies ? { Cookie: cookies } : {}),
        },
      },
      ok: (status) => status === 200 || status === 204 || status === 401 || status === 405,
    },
  ];

  const warnings = [];

  for (const target of targets) {
    try {
      const headers = Object.fromEntries(
        Object.entries(target.init.headers || {}).filter(([, value]) => Boolean(value)),
      );
      const response = await fetch(target.url, { ...target.init, headers });
      if (!target.ok(response.status)) {
        warnings.push(
          `${target.name} responded with status ${response.status} ${response.statusText || ''}`.trim(),
        );
      }
    } catch (error) {
      warnings.push(`${target.name} check failed: ${error?.message || String(error)}`);
    }
  }

  return warnings;
}

async function login(baseUrl, loginPath, email, password) {
  const url = joinUrl(baseUrl, loginPath);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': BROWSER_UA,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const text = await response.text();
    let retryAfterMs = parseRetryAfterValue(response.headers.get('retry-after'));
    if (!retryAfterMs) {
      try {
        const parsed = JSON.parse(text);
        retryAfterMs =
          parseRetryAfterValue(parsed?.retry_after) ||
          parseRetryAfterValue(parsed?.retryAfter) ||
          parseRetryAfterMessage(parsed?.message || parsed?.error || text);
      } catch {
        retryAfterMs = parseRetryAfterMessage(text);
      }
    }

    const error = new Error(`Login failed (${response.status}): ${text}`);
    error.status = response.status;
    if (retryAfterMs && response.status === 429) {
      error.retryAfterMs = retryAfterMs;
    }
    throw error;
  }

  const data = await response.json();
  if (!data.token) {
    throw new Error(`Login response did not include a token: ${JSON.stringify(data)}`);
  }

  const rawCookies =
    (typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : response.headers.raw?.()['set-cookie']) ?? [];
  const cookies = rawCookies
    .map((cookie) => cookie.split(';')[0])
    .filter(Boolean)
    .join('; ');

  const expiresAt = decodeJwtExpiry(data.token);

  return { token: data.token, user: data.user || {}, cookies, expiresAt };
}

async function callSupervisor(baseUrl, completionPath, token, cookies, agentId, prompt) {
  const url = joinUrl(baseUrl, completionPath);
  const now = new Date().toISOString();
  const messageId = randomUUID();
  const parentMessageId = randomUUID();
  const conversationId = randomUUID();

  const payload = {
    text: prompt,
    sender: 'User',
    clientTimestamp: now,
    isCreatedByUser: true,
    parentMessageId,
    conversationId,
    messageId,
    error: false,
    endpoint: 'agents',
    agentId,
    key: now,
    isTemporary: false,
    isRegenerate: false,
    isContinued: false,
    responseMessageId: null,
    agent_id: agentId,
    ephemeralAgent: {
      execute_code: false,
      web_search: false,
      file_search: false,
      artifacts: false,
      mcp: [],
    },
  };
  const fetchOnce = async () =>
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json,text/event-stream',
        Authorization: `Bearer ${token}`,
        'User-Agent': BROWSER_UA,
        ...(cookies ? { Cookie: cookies } : {}),
      },
      body: JSON.stringify(payload),
      duplex: 'half',
    });

  let response = await fetchOnce();
  if (!response.ok || (response.status >= 500 && response.status < 600)) {
    console.warn(`[warn] request failed (${response.status}); retrying once...`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    response = await fetchOnce();
  }

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  if (!response.ok) {
    if (response.status === 401) {
      const unauthorized = new Error('Supervisor call failed (401): Unauthorized');
      unauthorized.status = 401;
      throw unauthorized;
    }
    if (contentType.includes('text/event-stream') || text.trim().startsWith('event:')) {
      const { error } = parseEventStream(text);
      throw new Error(`Supervisor call failed (${response.status}): ${error || text}`);
    }
    throw new Error(`Supervisor call failed (${response.status}): ${text || '[empty body]'}`);
  }

  if (contentType.includes('text/html')) {
    throw new Error(
      `Supervisor returned HTML instead of JSON. Check --completion-path (response snippet: ${text.slice(0, 120)}...)`,
    );
  }

  if (contentType.includes('application/json') || text.trim().startsWith('{')) {
    try {
      const data = JSON.parse(text);
      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error(`Unexpected supervisor response: ${text}`);
      }
      return content.trim();
    } catch (err) {
      throw new Error(`Failed to parse JSON response: ${err.message}\n${text}`);
    }
  }

  if (contentType.includes('text/event-stream') || text.trim().startsWith('event:')) {
    const { content, error } = parseEventStream(text);
    if (error) {
      console.warn('[debug] SSE error payload:', text);
      throw new Error(`Supervisor error stream: ${error}`);
    }
    if (!content) {
      console.warn('[debug] SSE stream without content:', text);
      throw new Error(`Unexpected supervisor stream: ${text}`);
    }
    return content;
  }

  throw new Error(`Unknown response format (${contentType}): ${text}`);
}

function parseEventStream(text) {
  let currentEvent = 'message';
  let content = '';
  let errorMessage = null;

  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  for (let rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('event:')) {
      currentEvent = line.slice(6).trim();
      continue;
    }
    if (!line.startsWith('data:')) {
      continue;
    }
    const payloadText = line.slice(5).trim();
    if (payloadText === '[DONE]') {
      continue;
    }
    try {
      const payload = JSON.parse(payloadText);
      if (currentEvent === 'error') {
        errorMessage =
          payload?.error?.message ||
          payload?.message ||
          payloadText;
      } else {
        const textParts = extractContentFromPayload(payload);
        if (textParts) {
          content += textParts;
        }
      }
    } catch {
      if (currentEvent === 'error') {
        errorMessage = payloadText;
      }
    }
  }

  if (!content) {
    content = content?.trim?.() || '';
  } else {
    content = content.trim();
  }

  return { content, error: errorMessage };
}

function parseEventStreamError(text) {
  const { error } = parseEventStream(text);
  return error || text;
}

function parseEventStreamAnswer(text) {
  const { content } = parseEventStream(text);
  return content || null;
}

function extractContentFromPayload(payload) {
  const segments = [];
  const collect = (segment) => {
    if (!segment) return;
    if (typeof segment === 'string') {
      segments.push(segment);
      return;
    }
    if (Array.isArray(segment)) {
      segment.forEach(collect);
      return;
    }
    if (typeof segment === 'object') {
      if (segment.text) {
        segments.push(String(segment.text));
      } else if (segment.content) {
        collect(segment.content);
      }
      if (segment.message) {
        collect(segment.message);
      }
      if (segment.data) {
        collect(segment.data);
      }
    }
  };

  if (payload?.responseMessage?.text) collect(payload.responseMessage.text);
  if (payload?.responseMessage?.content) collect(payload.responseMessage.content);
  if (payload?.message?.content) collect(payload.message.content);
  if (payload?.message?.text) collect(payload.message.text);
  if (payload?.content) collect(payload.content);
  if (payload?.text) collect(payload.text);

  return segments.join('');
}

function loadDataset(datasetPath, fallbackAgentId) {
  const fullPath = path.resolve(datasetPath);
  const raw = fs.readFileSync(fullPath, 'utf-8');
  const entries = JSON.parse(raw);
  return entries.map((row, idx) => ({
    id: row?.id || `row-${idx + 1}`,
    prompt: row?.input || '',
    expected: row?.expected_keywords || '',
    agentId: row?.agent_id || fallbackAgentId,
  }));
}

function validateDataset(entries, fallbackAgentId) {
  const warnings = [];
  const seenIds = new Set();
  const rows = [];

  entries.forEach((row, idx) => {
    const id = row?.id || `row-${idx + 1}`;
    if (seenIds.has(id)) {
      warnings.push(`Duplicate row id encountered: ${id}; keeping the first instance.`);
      return;
    }
    seenIds.add(id);

    const prompt = typeof row?.prompt === 'string' ? row.prompt.trim() : '';
    const expected = typeof row?.expected === 'string' ? row.expected.trim() : '';
    if (!prompt) {
      warnings.push(`Row ${id} skipped: missing prompt.`);
      return;
    }
    if (!expected) {
      warnings.push(`Row ${id}: expected keywords empty.`);
    }

    let agentId = row?.agentId;
    if (!agentId || typeof agentId !== 'string') {
      warnings.push(`Row ${id}: missing agentId; using default ${fallbackAgentId}.`);
      agentId = fallbackAgentId;
    }

    rows.push({
      id,
      prompt,
      expected,
      agentId,
    });
  });

  return { rows, warnings };
}

function loadCachedSession(cachePath, { baseUrl, email }) {
  try {
    if (!cachePath || !fs.existsSync(cachePath)) {
      return null;
    }
    const raw = fs.readFileSync(cachePath, 'utf-8');
    const cached = JSON.parse(raw);
    if (!cached || cached.baseUrl !== baseUrl || cached.email !== email) {
      return null;
    }
    if (!cached.token || typeof cached.token !== 'string') {
      return null;
    }
    const expiresAt = Number(cached.expiresAt);
    return {
      token: cached.token,
      cookies: cached.cookies || null,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
    };
  } catch (error) {
    console.warn(`[warn] Failed to load session cache: ${error.message}`);
    return null;
  }
}

function saveCachedSession(cachePath, payload) {
  if (!cachePath) {
    return;
  }
  try {
    const dir = path.dirname(cachePath);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const toWrite = {
      baseUrl: payload.baseUrl,
      email: payload.email,
      token: payload.token,
      cookies: payload.cookies,
      expiresAt: payload.expiresAt,
      savedAt: Date.now(),
    };
    fs.writeFileSync(cachePath, JSON.stringify(toWrite), { encoding: 'utf-8', mode: 0o600 });
  } catch (error) {
    console.warn(`[warn] Failed to save session cache: ${error.message}`);
  }
}

function clearCachedSession(cachePath) {
  if (!cachePath) {
    return;
  }
  try {
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
    }
  } catch (error) {
    console.warn(`[warn] Failed to clear session cache: ${error.message}`);
  }
}

async function main() {
  const {
    baseUrl,
    email,
    password: pwdArg,
    dataset,
    sleep,
    jitter,
    completionPath,
    loginPath,
    defaultAgentId,
    refreshOn401,
    resumeFrom,
    runLogPath,
    skipHealthCheck,
    useSessionCache,
    sessionCachePath,
  } = parseArgs();
  const password = pwdArg || (await promptForPassword('LibreChat password: '));

  let token;
  let cookies;
  let tokenExpiresAt = null;

  const resolvedSessionCachePath = useSessionCache && sessionCachePath ? path.resolve(sessionCachePath) : null;
  const loadSession = () =>
    resolvedSessionCachePath
      ? loadCachedSession(resolvedSessionCachePath, { baseUrl, email })
      : null;
  const saveSession = ({ token: sessionToken, cookies: sessionCookies, expiresAt }) => {
    if (!resolvedSessionCachePath) {
      return;
    }
    saveCachedSession(resolvedSessionCachePath, {
      baseUrl,
      email,
      token: sessionToken,
      cookies: sessionCookies,
      expiresAt,
    });
  };
  const clearSession = () => {
    if (!resolvedSessionCachePath) {
      return;
    }
    clearCachedSession(resolvedSessionCachePath);
  };

  const authenticate = async (isRetry = false) => {
    const context = isRetry ? 're-authenticate' : 'authenticate';

    for (let attempt = 1; attempt <= AUTH_RETRY_LIMIT; attempt += 1) {
      try {
        const {
          token: tkn,
          user,
          cookies: cookieHeader,
          expiresAt,
        } = await login(baseUrl, loginPath, email, password);
        token = tkn;
        cookies = cookieHeader;
        tokenExpiresAt = expiresAt;
        saveSession({ token: tkn, cookies: cookieHeader, expiresAt });
        const message = isRetry
          ? `[info] Re-authenticated as ${user?.email || email}.`
          : `Logged in as ${user?.email || email}.`;
        console.log(message);
        return;
      } catch (error) {
        clearSession();
        const isRateLimited = error?.status === 429 || error?.retryAfterMs;
        const remaining = AUTH_RETRY_LIMIT - attempt;
        if (isRateLimited && remaining > 0) {
          const waitMs = Math.max(error?.retryAfterMs ?? 60_000, 5_000);
          const waitSeconds = Math.ceil(waitMs / 1000);
          console.warn(
            `[warn] Login rate limited; waiting ${waitSeconds}s before retry (${attempt}/${AUTH_RETRY_LIMIT}).`,
          );
          await delay(waitMs);
          continue;
        }

        console.error(`Failed to ${context}: ${error.message}`);
        if (!isRetry) {
          process.exit(1);
        }
        throw error;
      }
    }

    const failureMessage = `Failed to ${context} after ${AUTH_RETRY_LIMIT} attempts.`;
    console.error(failureMessage);
    if (!isRetry) {
      process.exit(1);
    }
    throw new Error(failureMessage);
  };

  const ensureTokenFresh = async () => {
    if (!tokenExpiresAt) {
      return;
    }
    const refreshBufferMs = 60_000;
    if (Date.now() >= tokenExpiresAt - refreshBufferMs) {
      console.log('[info] Token nearing expiry; refreshing session.');
      await authenticate(true);
    }
  };

  if (resolvedSessionCachePath) {
    const cached = loadSession();
    if (cached) {
      const ttlMs = cached.expiresAt ? cached.expiresAt - Date.now() : null;
      if (!cached.expiresAt || ttlMs > 30_000) {
        token = cached.token;
        cookies = cached.cookies;
        tokenExpiresAt = cached.expiresAt || null;
        const ttlText = formatTtl(ttlMs);
        console.log(`[info] Using cached session for ${email} (TTL ${ttlText}).`);
      } else {
        console.log('[info] Cached session is expired or near expiry; re-authenticating.');
        clearSession();
      }
    }
  }

  if (!token) {
    await authenticate();
  }

  const healthWarnings = await performHealthChecks({
    baseUrl,
    loginPath,
    completionPath,
    token,
    cookies,
    skip: skipHealthCheck,
  });
  if (healthWarnings.length > 0) {
    healthWarnings.forEach((msg) => console.warn(`[warn] Health check: ${msg}`));
  } else if (!skipHealthCheck) {
    console.log('[info] Health checks passed.');
  }

  const rawDataset = loadDataset(dataset, defaultAgentId);
  const { rows: datasetRows, warnings: datasetWarnings } = validateDataset(rawDataset, defaultAgentId);
  if (datasetWarnings.length > 0) {
    datasetWarnings.forEach((msg) => console.warn(`[warn] Dataset: ${msg}`));
  }
  if (datasetRows.length === 0) {
    console.error('Dataset contains no runnable prompts after validation.');
    process.exit(1);
  }

  let resumeReached = !resumeFrom;
  if (resumeFrom) {
    const index = datasetRows.findIndex((row) => row.id === resumeFrom);
    if (index === -1) {
      console.warn(`[warn] resume id ${resumeFrom} not found; starting from beginning.`);
      resumeReached = true;
    }
  }

  const metrics = {
    start: Date.now(),
    passed: 0,
    failed: 0,
    errors: 0,
    skipped: 0,
    total: datasetRows.length,
    results: [],
  };

  const baseSleep = Number.isFinite(sleep) && sleep > 0 ? Number(sleep) : 0;
  const maxJitter = Number.isFinite(jitter) && jitter > 0 ? Number(jitter) : 0;
  let unauthorizedStreak = 0;
  let refreshSuspended = false;
  let refreshSuspendedReason = null;

  for (let i = 0; i < datasetRows.length; i += 1) {
    const { id, prompt, expected, agentId } = datasetRows[i];

    if (!resumeReached) {
      if (id === resumeFrom) {
        resumeReached = true;
        console.log(`[info] Resuming run at ${id}.`);
      } else {
        metrics.skipped += 1;
        continue;
      }
    }

    const effectiveAgentId = agentId || defaultAgentId;

    const evaluate = async () => {
      await ensureTokenFresh();

      const answer = await callSupervisor(
        baseUrl,
        completionPath,
        token,
        cookies,
        effectiveAgentId,
        prompt,
      );

      const partKeywords = extractImportantKeywords(expected);
      const generalKeywords = extractGeneralKeywords(expected);
      const normalizedAnswer = answer.toLowerCase();

      const skuMatch =
        partKeywords.length === 0 ||
        partKeywords.every((keyword) =>
          normalizedAnswer.includes(keyword.replace(/\s+/g, '').toLowerCase()),
        );

      const matchedGeneral = generalKeywords.filter((kw) => normalizedAnswer.includes(kw)).length;
      const generalMatch = generalKeywords.length === 0 || matchedGeneral > 0;

      const match = skuMatch && generalMatch;
      const status = match ? 'PASS' : 'FAIL';
      if (match) {
        metrics.passed += 1;
        metrics.results.push({ id, status });
        console.log(`[${status}] ${id}`);
      } else {
        metrics.failed += 1;
        metrics.results.push({
          id,
          status,
          expected: expected.slice(0, 200),
          received: answer.slice(0, 200),
        });
        console.log(`[${status}] ${id}`);
        console.log(`  Prompt   : ${prompt}`);
        console.log(`  Expected : ${expected.slice(0, 200)}${expected.length > 200 ? '…' : ''}`);
        console.log(`  Received : ${answer.slice(0, 200)}${answer.length > 200 ? '…' : ''}\n`);
      }
    };

    const recordError = (message) => {
      metrics.errors += 1;
      metrics.results.push({ id, status: 'ERROR', message });
      console.log(`[ERROR] ${id}: ${message}`);
    };

    let handled = false;
    let attempts = 0;
    while (!handled && attempts < 3) {
      attempts += 1;
      try {
        await evaluate();
        unauthorizedStreak = 0;
        handled = true;
      } catch (error) {
        const isUnauthorized =
          error?.status === 401 || /\(401\)/.test(error?.message || '');
        if (isUnauthorized) {
          unauthorizedStreak += 1;
          const allowRefresh =
            !refreshSuspended &&
            (refreshOn401 || unauthorizedStreak >= MAX_UNAUTHORIZED_WITHOUT_REFRESH);
          if (allowRefresh) {
            const reason = refreshOn401
              ? 'flag enabled'
              : `exceeded ${MAX_UNAUTHORIZED_WITHOUT_REFRESH} consecutive 401s`;
            console.warn(
              `[WARN] ${id}: received 401 (unauthorized); attempting to re-authenticate (${reason}).`,
            );
            try {
              await authenticate(true);
              unauthorizedStreak = 0;
              continue;
            } catch (retryError) {
              refreshSuspended = true;
              refreshSuspendedReason = retryError.message || 'Re-authentication failed';
              unauthorizedStreak = 0;
              recordError(`${retryError.message} (further re-auth attempts suspended)`);
              handled = true;
            }
          } else {
            if (refreshSuspended && refreshSuspendedReason) {
              console.warn(
                `[warn] Re-authentication currently suspended: ${refreshSuspendedReason}`,
              );
            }
            unauthorizedStreak = 0;
            recordError(
              `${error.message} (refresh disabled; will continue with existing token until ${MAX_UNAUTHORIZED_WITHOUT_REFRESH} consecutive 401s)`,
            );
            handled = true;
          }
        } else {
          unauthorizedStreak = 0;
          recordError(error.message);
          handled = true;
        }
      }
    }

    if (!handled) {
      recordError('Exceeded retry attempts for supervisor call');
      unauthorizedStreak = 0;
    }

    if (baseSleep > 0 || maxJitter > 0) {
      const jitterDelay = maxJitter > 0 ? Math.random() * maxJitter : 0;
      const waitMs = baseSleep + jitterDelay;
      if (waitMs > 0) {
        await delay(waitMs);
      }
    }
  }

  const elapsedMs = Date.now() - metrics.start;
  console.log(
    `\nSummary: ${metrics.passed} passed, ${metrics.failed} failed, ${metrics.errors} errors out of ${metrics.total} (skipped ${metrics.skipped}).`,
  );
  console.log(`Elapsed: ${(elapsedMs / 1000).toFixed(1)}s`);

  if (runLogPath) {
    const logPayload = {
      startedAt: new Date(metrics.start).toISOString(),
      durationMs: elapsedMs,
      baseUrl,
      agentId: defaultAgentId,
      refreshOn401,
      total: metrics.total,
      passed: metrics.passed,
      failed: metrics.failed,
      errors: metrics.errors,
      skipped: metrics.skipped,
      results: metrics.results,
    };
    const resolvedLogPath = path.resolve(runLogPath);
    try {
      fs.writeFileSync(resolvedLogPath, JSON.stringify(logPayload, null, 2), 'utf-8');
      console.log(`[info] Run log written to ${resolvedLogPath}`);
    } catch (error) {
      console.warn(`[warn] Failed to write run log: ${error.message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
