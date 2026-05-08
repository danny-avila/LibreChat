import crypto from 'crypto';
import path from 'path';

const DEFAULT_BASE_URL = 'http://localhost:3080';
const DEFAULT_MONGO_URI = 'mongodb://127.0.0.1:27017/LibreChat-e2e';
const DEFAULT_RUNTIME_ENV_PATH = path.resolve(__dirname, '../specs/.test-results/runtime-env.json');
const GENERATED_CREDS_KEY = crypto.randomBytes(32).toString('hex');
const GENERATED_CREDS_IV = crypto.randomBytes(16).toString('hex');
const GENERATED_JWT_SECRET = crypto.randomBytes(32).toString('hex');
const GENERATED_JWT_REFRESH_SECRET = crypto.randomBytes(32).toString('hex');
const PASSTHROUGH_ENV_KEYS = [
  'APPDATA',
  'CI',
  'FORCE_COLOR',
  'HOME',
  'LOCALAPPDATA',
  'NO_COLOR',
  'NO_PROXY',
  'NODE_OPTIONS',
  'PATH',
  'PLAYWRIGHT_BROWSERS_PATH',
  'SHELL',
  'TEMP',
  'TMP',
  'TMPDIR',
  'USER',
  'USERNAME',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'HTTP_PROXY',
  'HTTPS_PROXY',
];

export function getE2EBaseURL() {
  return process.env.E2E_BASE_URL ?? DEFAULT_BASE_URL;
}

export function getE2EServerAddress(baseURL = getE2EBaseURL()) {
  const url = new URL(baseURL);
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');

  return { host, port };
}

export function getRuntimeEnvPath() {
  return process.env.E2E_RUNTIME_ENV_PATH ?? DEFAULT_RUNTIME_ENV_PATH;
}

function getPassthroughEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const passthroughKeys = [
    ...PASSTHROUGH_ENV_KEYS,
    ...(process.env.E2E_PASSTHROUGH_ENV?.split(',') ?? []),
  ];

  for (const key of passthroughKeys) {
    const value = process.env[key.trim()];
    if (value != null) {
      env[key.trim()] = value;
    }
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('MONGOMS_') && value != null) {
      env[key] = value;
    }
  }

  return env;
}

export function getBaseE2EEnv(): Record<string, string> {
  const baseURL = getE2EBaseURL();
  const { host, port } = getE2EServerAddress(baseURL);

  return {
    ...getPassthroughEnv(),
    NODE_ENV: 'CI',
    HOST: process.env.E2E_HOST ?? host,
    PORT: process.env.E2E_PORT ?? port,
    MONGO_URI: process.env.MONGO_URI ?? DEFAULT_MONGO_URI,
    DOMAIN_CLIENT: process.env.E2E_DOMAIN_CLIENT ?? baseURL,
    DOMAIN_SERVER: process.env.E2E_DOMAIN_SERVER ?? baseURL,
    E2E_RUNTIME_ENV_PATH: getRuntimeEnvPath(),
    E2E_USE_MEMORY_MONGO: process.env.E2E_USE_MEMORY_MONGO ?? 'auto',
    NO_INDEX: process.env.NO_INDEX ?? 'true',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? 'user_provided',
    CREDS_KEY: process.env.CREDS_KEY ?? GENERATED_CREDS_KEY,
    CREDS_IV: process.env.CREDS_IV ?? GENERATED_CREDS_IV,
    JWT_SECRET: process.env.JWT_SECRET ?? GENERATED_JWT_SECRET,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? GENERATED_JWT_REFRESH_SECRET,
    EMAIL_HOST: '',
    SEARCH: 'false',
    SESSION_EXPIRY: '60000',
    ALLOW_REGISTRATION: 'true',
    REFRESH_TOKEN_EXPIRY: '300000',
  };
}

export function getLocalE2EEnv(): Record<string, string> {
  return {
    ...getBaseE2EEnv(),
    TITLE_CONVO: 'false',
    LOGIN_VIOLATION_SCORE: '0',
    REGISTRATION_VIOLATION_SCORE: '0',
    CONCURRENT_VIOLATION_SCORE: '0',
    MESSAGE_VIOLATION_SCORE: '0',
    NON_BROWSER_VIOLATION_SCORE: '0',
    FORK_VIOLATION_SCORE: '0',
    IMPORT_VIOLATION_SCORE: '0',
    TTS_VIOLATION_SCORE: '0',
    STT_VIOLATION_SCORE: '0',
    FILE_UPLOAD_VIOLATION_SCORE: '0',
    RESET_PASSWORD_VIOLATION_SCORE: '0',
    VERIFY_EMAIL_VIOLATION_SCORE: '0',
    TOOL_CALL_VIOLATION_SCORE: '0',
    CONVO_ACCESS_VIOLATION_SCORE: '0',
    ILLEGAL_MODEL_REQ_SCORE: '0',
    LOGIN_MAX: '20',
    LOGIN_WINDOW: '1',
    REGISTER_MAX: '20',
    REGISTER_WINDOW: '1',
    LIMIT_CONCURRENT_MESSAGES: 'false',
    CONCURRENT_MESSAGE_MAX: '20',
    LIMIT_MESSAGE_IP: 'false',
    MESSAGE_IP_MAX: '100',
    MESSAGE_IP_WINDOW: '1',
    LIMIT_MESSAGE_USER: 'false',
    MESSAGE_USER_MAX: '100',
    MESSAGE_USER_WINDOW: '1',
  };
}
