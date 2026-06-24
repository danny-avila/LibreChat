import { CacheKeys, Time } from 'librechat-data-provider';
import { normalizeOpenIdIssuer } from './openid';
import { standardCache } from '~/cache';

export type FederatedAuthCacheEntry = {
  userId: string;
  tenantId?: string;
  subject: string;
  issuer?: string;
  email: string;
  username?: string;
  name?: string;
  role?: string;
  idOnTheSource?: string;
  accountSyncedAt: number;
  profileSyncedAt?: number;
  groupsSyncedAt?: number;
};

export type FederatedAuthCacheOptions = {
  enabled: boolean;
  ttlMs: number;
};

export type FederatedAuthCacheKeyInput = {
  tenantId?: string;
  issuer?: string;
  subject: string;
};

type FederatedAuthCacheStore = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttl?: number): Promise<unknown>;
  delete(key: string): Promise<unknown>;
};

const BASE_TENANT_SEGMENT = 'base';

function getStore(): FederatedAuthCacheStore {
  return standardCache(CacheKeys.FEDERATED_AUTH, Time.FIVE_MINUTES);
}

function getTenantSegment(tenantId: string | undefined): string {
  return tenantId && tenantId.trim() ? tenantId : BASE_TENANT_SEGMENT;
}

function normalizeIssuerSegment(issuer: string | undefined): string {
  return normalizeOpenIdIssuer(issuer) ?? '';
}

export function getFederatedAuthCacheKey(input: FederatedAuthCacheKeyInput): string {
  return [
    getTenantSegment(input.tenantId),
    normalizeIssuerSegment(input.issuer),
    input.subject,
  ].join(':');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidEntry(value: unknown): value is FederatedAuthCacheEntry {
  if (!isObject(value)) {
    return false;
  }

  if (
    typeof value.userId !== 'string' ||
    !value.userId ||
    typeof value.subject !== 'string' ||
    !value.subject ||
    typeof value.email !== 'string' ||
    !isValidNumber(value.accountSyncedAt)
  ) {
    return false;
  }

  return (
    isOptionalString(value.tenantId) &&
    isOptionalString(value.issuer) &&
    isOptionalString(value.username) &&
    isOptionalString(value.name) &&
    isOptionalString(value.role) &&
    isOptionalString(value.idOnTheSource) &&
    (value.profileSyncedAt === undefined || isValidNumber(value.profileSyncedAt)) &&
    (value.groupsSyncedAt === undefined || isValidNumber(value.groupsSyncedAt))
  );
}

function matchesInput(entry: FederatedAuthCacheEntry, input: FederatedAuthCacheKeyInput): boolean {
  return (
    entry.subject === input.subject &&
    getTenantSegment(entry.tenantId) === getTenantSegment(input.tenantId) &&
    normalizeIssuerSegment(entry.issuer) === normalizeIssuerSegment(input.issuer)
  );
}

export async function readFederatedAuthCache(
  input: FederatedAuthCacheKeyInput,
  options: Pick<FederatedAuthCacheOptions, 'enabled'>,
  cache: FederatedAuthCacheStore = getStore(),
): Promise<FederatedAuthCacheEntry | null> {
  if (!options.enabled) {
    return null;
  }

  const value = await cache.get(getFederatedAuthCacheKey(input));
  if (!isValidEntry(value) || !matchesInput(value, input)) {
    return null;
  }

  return value;
}

export async function writeFederatedAuthCache(
  input: FederatedAuthCacheKeyInput,
  entry: FederatedAuthCacheEntry,
  options: FederatedAuthCacheOptions,
  cache: FederatedAuthCacheStore = getStore(),
): Promise<void> {
  if (!options.enabled || options.ttlMs <= 0) {
    return;
  }

  await cache.set(getFederatedAuthCacheKey(input), entry, options.ttlMs);
}

export async function invalidateFederatedAuthCache(
  input: FederatedAuthCacheKeyInput,
  cache: FederatedAuthCacheStore = getStore(),
): Promise<void> {
  await cache.delete(getFederatedAuthCacheKey(input));
}
