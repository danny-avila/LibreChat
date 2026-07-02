export const DEFAULT_OBO_EXPIRES_IN_SECONDS = 3600;
export const OBO_TOKEN_EXPIRY_BUFFER_SECONDS = 30;
export const MIN_OBO_TOKEN_LIFETIME_SECONDS = 1;

const OBO_TOKEN_EXPIRY_BUFFER_MS = OBO_TOKEN_EXPIRY_BUFFER_SECONDS * 1000;
const MIN_OBO_TOKEN_LIFETIME_MS = MIN_OBO_TOKEN_LIFETIME_SECONDS * 1000;

export function normalizeOboExpiresInSeconds(expiresIn?: number | string | null): number {
  if (expiresIn == null) {
    return DEFAULT_OBO_EXPIRES_IN_SECONDS;
  }

  const numericExpiresIn = Number(expiresIn);
  if (!Number.isFinite(numericExpiresIn)) {
    return DEFAULT_OBO_EXPIRES_IN_SECONDS;
  }

  return Math.max(MIN_OBO_TOKEN_LIFETIME_SECONDS, Math.floor(numericExpiresIn));
}

export function getOboTokenExpiresAtMs({
  expiresAt,
  expiresIn,
  now,
}: {
  expiresAt?: number | null;
  expiresIn?: number | string | null;
  now: number;
}): number {
  if (expiresAt != null && Number.isFinite(expiresAt)) {
    return expiresAt;
  }

  return now + normalizeOboExpiresInSeconds(expiresIn) * 1000;
}

export function getSkewedOboTokenExpiresAtMs(expiresAt: number, now: number): number {
  return Math.max(now + MIN_OBO_TOKEN_LIFETIME_MS, expiresAt - OBO_TOKEN_EXPIRY_BUFFER_MS);
}

export function getSkewedOboTokenCacheTtlMs(expiresAt: number, now: number): number {
  return Math.max(MIN_OBO_TOKEN_LIFETIME_MS, expiresAt - now - OBO_TOKEN_EXPIRY_BUFFER_MS);
}

export function hasUsableOboTokenExpiry(
  expiresAt?: number | null,
  now: number = Date.now(),
): boolean {
  return (
    expiresAt != null && Number.isFinite(expiresAt) && expiresAt > now + OBO_TOKEN_EXPIRY_BUFFER_MS
  );
}
