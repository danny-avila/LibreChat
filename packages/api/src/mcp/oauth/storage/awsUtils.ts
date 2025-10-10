import { setTimeout as sleep } from 'timers/promises';
import type { TokenCreateData } from '@librechat/data-schemas';
import type { RetryOptions, TokenRecordPayload, TokenDataEnvelope } from './types';

const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_BACKOFF = 200;

export function sanitizeSegment(segment: string): string {
  if (!segment) {
    return '_';
  }
  return segment.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

export function resolvePrefixTemplate(prefix?: string): string {
  const template = prefix && prefix.trim().length > 0 ? prefix : '/librechat/{env}/mcp';
  const env = process.env.LIBRECHAT_ENV || process.env.NODE_ENV || 'production';
  return template.replace('{env}', sanitizeSegment(env));
}

export function buildResourceName(prefix: string, userId: string, identifier: string): string {
  const sanitizedPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  const segments = identifier.split(':').map(sanitizeSegment);
  const userSegment = sanitizeSegment(userId);
  return `${sanitizedPrefix}/${userSegment}/${segments.join('/')}`;
}

export function extractEncryptedFlag(
  metadata?: Map<string, unknown> | Record<string, unknown> | null,
  fallback = true,
): boolean {
  if (!metadata) {
    return fallback;
  }

  if (metadata instanceof Map) {
    const value = metadata.get('encrypted');
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      return value === 'true';
    }
    return fallback;
  }

  if (typeof metadata === 'object' && metadata !== null) {
    const value = (metadata as Record<string, unknown>).encrypted;
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      return value === 'true';
    }
  }

  return fallback;
}

export function metadataToObject(
  metadata?: Map<string, unknown> | Record<string, unknown> | null,
): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }

  if (metadata instanceof Map) {
    return Object.fromEntries(metadata.entries());
  }

  if (typeof metadata === 'object') {
    return { ...metadata };
  }

  return undefined;
}

export function objectToMetadataMap(
  metadata?: Record<string, unknown>,
): Map<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }
  return new Map(Object.entries(metadata));
}

export async function withRetry<T>(operation: () => Promise<T>, retry?: RetryOptions): Promise<T> {
  const maxAttempts = retry?.maxAttempts ?? DEFAULT_RETRY_ATTEMPTS;
  const backoffMs = retry?.backoffMs ?? DEFAULT_RETRY_BACKOFF;

  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      attempt++;
      if (attempt >= maxAttempts) {
        break;
      }
      await sleep(backoffMs * attempt);
    }
  }

  throw lastError ?? new Error('AWS operation failed without error context');
}

export function toTokenRecordPayload(
  token: TokenCreateData,
  createdAt: Date,
  expiresAt: Date,
  encrypted: boolean,
): TokenRecordPayload {
  const metadata = metadataToObject(token.metadata) ?? {};
  metadata.encrypted = encrypted;

  return {
    userId: String(token.userId),
    identifier: token.identifier,
    type: token.type,
    token: token.token,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    metadata,
    encrypted,
  };
}

export function toTokenDataEnvelope(record: TokenRecordPayload): TokenDataEnvelope {
  return {
    userId: record.userId,
    identifier: record.identifier,
    type: record.type,
    token: record.token,
    createdAt: new Date(record.createdAt),
    expiresAt: new Date(record.expiresAt),
    metadata: objectToMetadataMap(record.metadata),
  };
}

export function mergeUpdate(
  existing: TokenRecordPayload,
  update: Partial<TokenRecordPayload> & {
    token?: string;
    expiresAt?: Date | string;
    metadata?: Map<string, unknown> | Record<string, unknown>;
    encrypted?: boolean;
  },
): TokenRecordPayload {
  const metadata = metadataToObject(update.metadata) ?? existing.metadata ?? undefined;
  const metadataEncryptedValue =
    metadata && typeof metadata === 'object' && 'encrypted' in metadata
      ? (metadata as Record<string, unknown>).encrypted
      : undefined;
  const encrypted =
    update.encrypted ??
    existing.encrypted ??
    (metadataEncryptedValue !== undefined
      ? metadataEncryptedValue === true || metadataEncryptedValue === 'true'
      : true);

  let resolvedExpiresAt: string;
  const expiresAtCandidate = update.expiresAt as unknown;
  if (expiresAtCandidate instanceof Date) {
    resolvedExpiresAt = expiresAtCandidate.toISOString();
  } else if (typeof expiresAtCandidate === 'string') {
    resolvedExpiresAt = expiresAtCandidate;
  } else {
    resolvedExpiresAt = existing.expiresAt;
  }

  return {
    userId: existing.userId,
    identifier: update.identifier ?? existing.identifier,
    type: update.type ?? existing.type,
    token: update.token ?? existing.token,
    createdAt: existing.createdAt,
    expiresAt: resolvedExpiresAt,
    metadata,
    encrypted,
  };
}
