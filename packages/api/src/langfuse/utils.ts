import { logger } from '@librechat/data-schemas';
import type { AppConfig } from '@librechat/data-schemas';
import { decryptConfigSecret } from '~/admin/secrets';
import { normalizeString } from '~/utils/text';
import { resolveHeaders } from '~/utils/env';

type LangfuseAppConfig = NonNullable<AppConfig['langfuse']>;

const UNRESOLVED_ENV_PATTERN = /\$\{[^}]+\}/;

/** Header names already reported, so a per-run resolution cannot spam the log.
 *  Bounded by the deployment's configured header names. */
const unresolvedHeaderWarnings = new Set<string>();

function warnUnresolvedHeader(name: string): void {
  if (unresolvedHeaderWarnings.has(name)) {
    return;
  }
  unresolvedHeaderWarnings.add(name);
  logger.warn(`[langfuse] Dropping header "${name}": its \${...} environment variable is not set.`);
}

export function toBasicAuthorization(publicKey: string, secretKey: string): string {
  return `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`;
}

/**
 * Resolves the deployment's custom Langfuse headers through the same pipeline
 * as endpoint headers — `${ENV_VAR}` interpolation and header-safe encoding of
 * non-ASCII values.
 *
 * No user or request body is supplied: one exporter serves every user's spans,
 * so per-user placeholders have no meaning here. `stripUnresolved` empties them
 * instead of forwarding template syntax upstream, and empty values are then
 * dropped so a misconfigured header is absent rather than blank — a proxy
 * rejecting a blank credential is far harder to diagnose than a missing one.
 *
 * @returns the resolved headers, or `undefined` when none survive.
 */
export function resolveLangfuseHeaders(
  headers?: Record<string, string | undefined>,
): Record<string, string> | undefined {
  if (headers == null) {
    return undefined;
  }

  /** `TCustomConfig` is a `DeepPartial`, so record values arrive as
   *  `string | undefined` regardless of what the schema declares. */
  const declared: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === 'string' && name.trim() !== '') {
      declared[name] = value;
    }
  }
  if (Object.keys(declared).length === 0) {
    return undefined;
  }

  const resolved = resolveHeaders({ headers: declared, stripUnresolved: true });
  const entries = Object.entries(resolved).filter(([name, value]) => {
    if (value.trim() === '') {
      return false;
    }
    /** `stripUnresolved` clears `{{...}}` placeholders but leaves `${VAR}`
     *  literal when the variable is unset, and forwarding that to a gateway
     *  reads as a wrong credential rather than a missing one. */
    if (UNRESOLVED_ENV_PATTERN.test(value)) {
      warnUnresolvedHeader(name);
      return false;
    }
    return true;
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function resolveTenantCredentials(
  config?: LangfuseAppConfig,
): { publicKey: string; secretKey: string } | undefined {
  const publicKey = normalizeString(config?.publicKey);
  const secretKey = decryptConfigSecret(config?.secretKey);
  if (!publicKey || !secretKey) {
    return undefined;
  }
  return { publicKey, secretKey };
}

const TRUE_ENV_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_ENV_VALUES = new Set(['0', 'false', 'no', 'off']);

export function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (TRUE_ENV_VALUES.has(normalized)) {
    return true;
  }
  if (FALSE_ENV_VALUES.has(normalized)) {
    return false;
  }
  return undefined;
}

export function isTrueEnv(value: unknown): boolean {
  return normalizeBoolean(value) === true;
}

export function isFalseEnv(value: unknown): boolean {
  return normalizeBoolean(value) === false;
}
