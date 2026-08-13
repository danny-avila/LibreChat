import type { ClerkAuthConfig, PublicClerkAuthConfig } from './types';

export class ClerkAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClerkAuthConfigError';
  }
}

const CLERK_ENV_KEYS = [
  'CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'CLERK_JWT_KEY',
  'CLERK_AUTHORIZED_PARTIES',
  'CLERK_WEBHOOK_SIGNING_SECRET',
] as const;

type ClerkEnvKey = (typeof CLERK_ENV_KEYS)[number];

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function readTrimmed(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const raw = env[key];
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isDevelopmentEnvironment(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV !== 'production';
}

function normalizeAuthorizedParty(candidate: string, isDevelopment: boolean): string {
  if (candidate.length === 0) {
    throw new ClerkAuthConfigError('CLERK_AUTHORIZED_PARTIES must not contain blank entries.');
  }
  if (candidate.includes('*')) {
    throw new ClerkAuthConfigError(
      `CLERK_AUTHORIZED_PARTIES origin "${candidate}" must not contain a wildcard.`,
    );
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new ClerkAuthConfigError(
      `CLERK_AUTHORIZED_PARTIES origin "${candidate}" is not a valid URL.`,
    );
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ClerkAuthConfigError(
      `CLERK_AUTHORIZED_PARTIES origin "${candidate}" must use http or https.`,
    );
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new ClerkAuthConfigError(
      `CLERK_AUTHORIZED_PARTIES origin "${candidate}" must not contain credentials.`,
    );
  }
  if (
    (url.pathname.length > 0 && url.pathname !== '/') ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new ClerkAuthConfigError(
      `CLERK_AUTHORIZED_PARTIES origin "${candidate}" must be an origin only, with no path, query, or fragment.`,
    );
  }

  const hostname = url.hostname.toLowerCase();
  const isLoopback = LOOPBACK_HOSTNAMES.has(hostname);
  if (url.protocol === 'http:' && !(isDevelopment && isLoopback)) {
    throw new ClerkAuthConfigError(
      `CLERK_AUTHORIZED_PARTIES origin "${candidate}" must use HTTPS outside loopback development.`,
    );
  }

  const port = url.port.length > 0 ? `:${url.port}` : '';
  return `${url.protocol}//${hostname}${port}`;
}

function parseAuthorizedParties(raw: string, isDevelopment: boolean): readonly string[] {
  const normalized = raw
    .split(',')
    .map((part) => part.trim())
    .map((part) => normalizeAuthorizedParty(part, isDevelopment));

  return Object.freeze([...new Set(normalized)]);
}

/**
 * Clerk's own key convention: publishable keys begin with `pk_`. A misconfigured
 * deployment that puts a secret key (`sk_`) in this slot would otherwise get
 * serialized straight into the public, anonymous `/api/config` response.
 */
function assertPublishableKeyIsNotSecretShaped(publishableKey: string): void {
  if (!publishableKey.startsWith('pk_')) {
    throw new ClerkAuthConfigError(
      'CLERK_PUBLISHABLE_KEY must be a publishable key (expected to start with "pk_").',
    );
  }
}

export function resolveClerkAuthConfig(env: NodeJS.ProcessEnv = process.env): ClerkAuthConfig {
  const values = Object.fromEntries(
    CLERK_ENV_KEYS.map((key) => [key, readTrimmed(env, key)]),
  ) as Record<ClerkEnvKey, string | undefined>;

  const presentKeys = CLERK_ENV_KEYS.filter((key) => values[key] !== undefined);
  if (presentKeys.length === 0) {
    return { enabled: false };
  }

  const missingKeys = CLERK_ENV_KEYS.filter((key) => values[key] === undefined);
  if (missingKeys.length > 0) {
    throw new ClerkAuthConfigError(
      `Clerk authentication configuration is incomplete. All five Clerk variables are ` +
        `required together, or none at all. Missing: ${missingKeys.join(', ')}.`,
    );
  }

  const publishableKey = values.CLERK_PUBLISHABLE_KEY as string;
  assertPublishableKeyIsNotSecretShaped(publishableKey);

  const authorizedParties = parseAuthorizedParties(
    values.CLERK_AUTHORIZED_PARTIES as string,
    isDevelopmentEnvironment(env),
  );

  return {
    enabled: true,
    publishableKey,
    secretKey: values.CLERK_SECRET_KEY as string,
    jwtKey: values.CLERK_JWT_KEY as string,
    authorizedParties,
    webhookSigningSecret: values.CLERK_WEBHOOK_SIGNING_SECRET as string,
  };
}

export function toPublicClerkAuthConfig(config: ClerkAuthConfig): PublicClerkAuthConfig {
  if (!config.enabled) {
    return { clerkLoginEnabled: false };
  }
  return { clerkLoginEnabled: true, clerkPublishableKey: config.publishableKey };
}
