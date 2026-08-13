import type { ClerkProfileOutcome } from '../../app/metrics';
import type { ClerkAuthConfigEnabled } from './types';
import { recordClerkProfileRequest } from '../../app/metrics';
import { ClerkAuthError } from './verify';

export const CLERK_PROFILE_TIMEOUT_MS: number = 5_000;

const CLERK_API_URL = 'https://api.clerk.com/v1/users';
const CLERK_API_VERSION = '2026-05-12';

export interface VerifiedClerkProfile {
  email: string;
  emailVerified: true;
  name?: string;
  username?: string;
  avatarUrl?: string;
}

export type ClerkProfileTransport = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface ClerkEmailAddressResponse {
  id?: unknown;
  email_address?: unknown;
  verification?: unknown;
}

interface ClerkUserResponse {
  id?: unknown;
  primary_email_address_id?: unknown;
  email_addresses?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  username?: unknown;
  image_url?: unknown;
}

interface ClerkEmailVerificationResponse {
  status?: unknown;
}

function unavailable(): ClerkAuthError {
  return new ClerkAuthError('CLERK_UNAVAILABLE', 503);
}

function forbidden(): ClerkAuthError {
  return new ClerkAuthError('CLERK_LOGIN_FORBIDDEN', 403);
}

function invalidToken(): ClerkAuthError {
  return new ClerkAuthError('CLERK_TOKEN_INVALID', 401);
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isClerkUserResponse(value: unknown): value is ClerkUserResponse {
  return isObject(value);
}

function isClerkEmailAddressResponse(value: unknown): value is ClerkEmailAddressResponse {
  return isObject(value);
}

function isVerificationResponse(value: unknown): value is ClerkEmailVerificationResponse {
  return isObject(value);
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeEmail(value: unknown): string {
  const email = normalizeOptionalString(value)?.toLowerCase();
  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    throw unavailable();
  }

  return email;
}

function normalizeName(firstName: unknown, lastName: unknown): string | undefined {
  const first = normalizeOptionalString(firstName);
  const last = normalizeOptionalString(lastName);
  return [first, last].filter((part): part is string => part != null).join(' ') || undefined;
}

function normalizeAvatarUrl(value: unknown): string | undefined {
  const candidate = normalizeOptionalString(value);
  if (!candidate) {
    return undefined;
  }

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return undefined;
    }
    if (url.username || url.password) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function getPrimaryEmail(user: ClerkUserResponse): ClerkEmailAddressResponse {
  if (user.primary_email_address_id == null) {
    throw forbidden();
  }
  if (typeof user.primary_email_address_id !== 'string' || !user.primary_email_address_id.trim()) {
    throw unavailable();
  }
  if (!Array.isArray(user.email_addresses)) {
    throw unavailable();
  }

  const primaryEmail = user.email_addresses.find(
    (candidate) =>
      isClerkEmailAddressResponse(candidate) && candidate.id === user.primary_email_address_id,
  );
  if (!primaryEmail || !isClerkEmailAddressResponse(primaryEmail)) {
    throw unavailable();
  }

  return primaryEmail;
}

function normalizeProfile(clerkId: string, payload: unknown): VerifiedClerkProfile {
  if (!isClerkUserResponse(payload)) {
    throw unavailable();
  }
  if (payload.id !== clerkId) {
    throw unavailable();
  }

  const primaryEmail = getPrimaryEmail(payload);
  if (
    !isVerificationResponse(primaryEmail.verification) ||
    primaryEmail.verification.status !== 'verified'
  ) {
    throw forbidden();
  }

  const name = normalizeName(payload.first_name, payload.last_name);
  const username = normalizeOptionalString(payload.username)?.toLowerCase();
  const avatarUrl = normalizeAvatarUrl(payload.image_url);

  return {
    email: normalizeEmail(primaryEmail.email_address),
    emailVerified: true,
    ...(name ? { name } : {}),
    ...(username ? { username } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value.trim())) {
    return undefined;
  }

  return Math.min(60, Math.max(1, Number(value)));
}

function getProfileOutcome(error: unknown): ClerkProfileOutcome {
  if (!(error instanceof ClerkAuthError)) {
    return 'unavailable';
  }

  switch (error.code) {
    case 'CLERK_LOGIN_FORBIDDEN':
      return 'forbidden';
    case 'CLERK_TOKEN_INVALID':
      return 'not_found';
    case 'CLERK_UPSTREAM_RATE_LIMITED':
      return 'rate_limited';
    case 'CLERK_UNAVAILABLE':
      return 'unavailable';
  }
}

function getElapsedSeconds(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
}

function throwForResponse(response: Response): void {
  if (response.ok) {
    return;
  }
  if (response.status === 404 || response.status === 410) {
    throw invalidToken();
  }
  if (response.status === 429) {
    throw new ClerkAuthError('CLERK_UPSTREAM_RATE_LIMITED', 429, {
      retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after')),
    });
  }

  throw unavailable();
}

async function parseResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw unavailable();
  }
}

export async function fetchClerkProfile(
  clerkId: string,
  config: ClerkAuthConfigEnabled,
  transport: ClerkProfileTransport = globalThis.fetch,
): Promise<VerifiedClerkProfile> {
  const normalizedClerkId = normalizeOptionalString(clerkId);
  if (!normalizedClerkId) {
    throw invalidToken();
  }

  const startedAt = process.hrtime.bigint();
  let outcome: ClerkProfileOutcome = 'unavailable';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLERK_PROFILE_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await transport(`${CLERK_API_URL}/${encodeURIComponent(normalizedClerkId)}`, {
        method: 'GET',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${config.secretKey}`,
          'Clerk-API-Version': CLERK_API_VERSION,
        },
        signal: controller.signal,
      });
    } catch {
      throw unavailable();
    }

    throwForResponse(response);
    const payload = await parseResponse(response);
    const profile = normalizeProfile(normalizedClerkId, payload);
    outcome = 'success';
    return profile;
  } catch (error) {
    outcome = getProfileOutcome(error);
    throw error;
  } finally {
    clearTimeout(timeout);
    recordClerkProfileRequest(outcome, getElapsedSeconds(startedAt));
  }
}
