import type { AppConfig } from '@librechat/data-schemas';
import { decryptConfigSecret } from '~/admin/secrets';
import { normalizeString } from '~/utils/text';

type LangfuseAppConfig = NonNullable<AppConfig['langfuse']>;

export function toBasicAuthorization(publicKey: string, secretKey: string): string {
  return `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`;
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
