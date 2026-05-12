import { encryptV2 } from '@librechat/data-schemas';
import { LANGFUSE_SECRET_CLEAR_VALUE, extractVariableName } from 'librechat-data-provider';
import type { LangfuseConfig } from 'librechat-data-provider';

export const ENCRYPTED_V2_VALUE = /^[a-f0-9]{32}:[a-f0-9]+$/i;

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function toPlainObject(value: unknown): unknown {
  if (!isRecord(value) || typeof value.toObject !== 'function') {
    return value;
  }
  return value.toObject();
}

async function encryptSensitiveValue(value: string): Promise<string> {
  return await encryptV2(encodeURIComponent(value));
}

async function normalizeLangfuseSecret(
  value: string,
  options: { preserveEncrypted?: boolean } = {},
): Promise<string | undefined> {
  if (!isNonEmptyString(value)) {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed === LANGFUSE_SECRET_CLEAR_VALUE) {
    return undefined;
  }
  if (extractVariableName(trimmed) != null) {
    return trimmed;
  }
  if (options.preserveEncrypted === true && ENCRYPTED_V2_VALUE.test(trimmed)) {
    return trimmed;
  }
  return await encryptSensitiveValue(trimmed);
}

export async function normalizeLangfuseConfig(
  incoming: unknown,
  existing?: unknown,
  options: { preserveIncomingEncrypted?: boolean } = {},
): Promise<LangfuseConfig | undefined> {
  if (!isRecord(incoming)) {
    return undefined;
  }

  const existingConfig = toPlainObject(existing);
  const existingLangfuse = isRecord(existingConfig) ? existingConfig : {};
  const normalized: LangfuseConfig = {};

  if (typeof incoming.enabled === 'boolean') {
    normalized.enabled = incoming.enabled;
  }

  for (const key of ['publicKey', 'baseUrl'] as const) {
    const value = incoming[key];
    if (isNonEmptyString(value)) {
      normalized[key] = value.trim();
    }
  }

  const incomingSecret = incoming.secretKey;
  if (incomingSecret === LANGFUSE_SECRET_CLEAR_VALUE) {
    return normalized;
  }

  if (isNonEmptyString(incomingSecret)) {
    normalized.secretKey = await normalizeLangfuseSecret(incomingSecret, {
      preserveEncrypted: options.preserveIncomingEncrypted === true,
    });
  } else {
    const existingSecret = existingLangfuse.secretKey;
    if (isNonEmptyString(existingSecret)) {
      normalized.secretKey = await normalizeLangfuseSecret(existingSecret, {
        preserveEncrypted: true,
      });
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function hasLangfuseSecret(value: unknown): boolean {
  const plain = toPlainObject(value);
  if (!isRecord(plain)) {
    return false;
  }
  const langfuse = toPlainObject(plain.langfuse);
  return isRecord(langfuse) && isNonEmptyString(langfuse.secretKey);
}

function redactSingleAgent(value: unknown): unknown {
  const plain = toPlainObject(value);
  if (!isRecord(plain)) {
    return plain;
  }

  const langfuse = toPlainObject(plain.langfuse);
  if (!isRecord(langfuse) || !isNonEmptyString(langfuse.secretKey)) {
    return plain;
  }

  return {
    ...plain,
    langfuse: {
      ...langfuse,
      secretKey: '',
    },
  };
}

export function redactLangfuseSecret(agent: unknown): unknown {
  const payload = toPlainObject(agent);
  if (!isRecord(payload)) {
    return payload;
  }

  const versions = Array.isArray(payload.versions) ? payload.versions : [];
  if (!hasLangfuseSecret(payload) && !versions.some(hasLangfuseSecret)) {
    return payload;
  }

  const redactedPayload = redactSingleAgent(payload);
  if (!isRecord(redactedPayload) || !Array.isArray(redactedPayload.versions)) {
    return redactedPayload;
  }

  return {
    ...redactedPayload,
    versions: redactedPayload.versions.map(redactSingleAgent),
  };
}
