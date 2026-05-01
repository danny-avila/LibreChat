import { logger } from '@librechat/data-schemas';
import { ErrorTypes } from 'librechat-data-provider';
import type { IUser, UserMethods } from '@librechat/data-schemas';
import type { FilterQuery } from 'mongoose';

export type OpenIdEmailClaims = {
  email?: unknown;
  preferred_username?: unknown;
  upn?: unknown;
  [claim: string]: unknown;
};

type OpenIdLookupField = 'openidId' | 'idOnTheSource';

export function normalizeOpenIdIssuer(issuer: string | undefined): string | undefined {
  const normalized = issuer?.trim().replace(/\/+$/, '');
  return normalized || undefined;
}

function getStringClaim(claims: OpenIdEmailClaims, claim: string): string | undefined {
  const value = claims[claim];
  return typeof value === 'string' && value ? value : undefined;
}

function isLegacyOpenIdIssuer(openidIssuer: string | undefined): boolean {
  const loginIssuer = normalizeOpenIdIssuer(process.env.OPENID_ISSUER);
  return openidIssuer != null && loginIssuer != null && openidIssuer === loginIssuer;
}

function getIssuerBoundConditions(
  field: OpenIdLookupField,
  value: string | undefined,
  openidIssuer: string | undefined,
): FilterQuery<IUser>[] {
  if (!value || typeof value !== 'string') return [];
  if (!openidIssuer) return [{ [field]: value }];

  const conditions: FilterQuery<IUser>[] = [{ [field]: value, openidIssuer }];

  if (isLegacyOpenIdIssuer(openidIssuer)) {
    conditions.push({
      [field]: value,
      $or: [{ openidIssuer: { $exists: false } }, { openidIssuer: null }, { openidIssuer: '' }],
    });
  }

  return conditions;
}

function isUserIssuerAllowed(user: IUser, openidIssuer: string | undefined): boolean {
  if (!openidIssuer) return true;

  const userIssuer = normalizeOpenIdIssuer(user.openidIssuer);
  if (userIssuer) return userIssuer === openidIssuer;

  return isLegacyOpenIdIssuer(openidIssuer);
}

export function getOpenIdEmail(
  claims: OpenIdEmailClaims | null | undefined,
  strategyName = 'openidStrategy',
): string | undefined {
  if (claims == null) return undefined;

  const claimKey = process.env.OPENID_EMAIL_CLAIM?.trim();
  if (claimKey) {
    const value = claims[claimKey];
    if (typeof value === 'string' && value) return value;
    if (value != null) {
      logger.warn(
        `[${strategyName}] OPENID_EMAIL_CLAIM="${claimKey}" resolved to a non-string value (type: ${typeof value}). Falling back to: email -> preferred_username -> upn.`,
      );
    } else {
      logger.warn(
        `[${strategyName}] OPENID_EMAIL_CLAIM="${claimKey}" not present in userinfo. Falling back to: email -> preferred_username -> upn.`,
      );
    }
  }

  return (
    getStringClaim(claims, 'email') ??
    getStringClaim(claims, 'preferred_username') ??
    getStringClaim(claims, 'upn')
  );
}

/**
 * Finds or migrates a user for OpenID authentication
 * @returns user object (with migration fields if needed), error message, and whether migration is needed
 */
export async function findOpenIDUser({
  openidId,
  findUser,
  email,
  openidIssuer,
  idOnTheSource,
  strategyName = 'openid',
}: {
  openidId: string;
  findUser: UserMethods['findUser'];
  email?: string;
  openidIssuer?: string;
  idOnTheSource?: string;
  strategyName?: string;
}): Promise<{ user: IUser | null; error: string | null; migration: boolean }> {
  const normalizedIssuer = normalizeOpenIdIssuer(openidIssuer);
  const primaryConditions = [
    ...getIssuerBoundConditions('openidId', openidId, normalizedIssuer),
    ...getIssuerBoundConditions('idOnTheSource', idOnTheSource, normalizedIssuer),
  ];

  let user = null;
  if (primaryConditions.length > 0) {
    user = await findUser({ $or: primaryConditions });
  }

  if (user?.openidId && !isUserIssuerAllowed(user, normalizedIssuer)) {
    logger.warn(
      `[${strategyName}] Rejected OpenID lookup for ${user.email}: stored openidIssuer does not match token issuer`,
    );
    return { user: null, error: ErrorTypes.AUTH_FAILED, migration: false };
  }

  if (user?.openidId && normalizedIssuer && !normalizeOpenIdIssuer(user.openidIssuer)) {
    user.openidIssuer = normalizedIssuer;
    return { user, error: null, migration: true };
  }

  if (!user && email) {
    user = await findUser({ email });
    logger.warn(
      `[${strategyName}] user ${user ? 'found' : 'not found'} with email: ${email} for openidId: ${openidId}`,
    );

    // If user found by email, check if they're allowed to use OpenID provider
    if (user && user.provider && user.provider !== 'openid') {
      logger.warn(
        `[${strategyName}] Attempted OpenID login by user ${user.email}, was registered with "${user.provider}" provider`,
      );
      return { user: null, error: ErrorTypes.AUTH_FAILED, migration: false };
    }

    if (user?.openidId && user.openidId !== openidId) {
      logger.warn(
        `[${strategyName}] Rejected email fallback for ${user.email}: stored openidId does not match token sub`,
      );
      return { user: null, error: ErrorTypes.AUTH_FAILED, migration: false };
    }

    if (user?.openidId && !isUserIssuerAllowed(user, normalizedIssuer)) {
      logger.warn(
        `[${strategyName}] Rejected email fallback for ${user.email}: stored openidIssuer does not match token issuer`,
      );
      return { user: null, error: ErrorTypes.AUTH_FAILED, migration: false };
    }

    if (user?.openidId && normalizedIssuer && !normalizeOpenIdIssuer(user.openidIssuer)) {
      user.openidIssuer = normalizedIssuer;
      return { user, error: null, migration: true };
    }

    if (user && !user.openidId) {
      logger.info(
        `[${strategyName}] Preparing user ${user.email} for migration to OpenID with sub: ${openidId}`,
      );
      user.provider = 'openid';
      user.openidId = openidId;
      if (normalizedIssuer) user.openidIssuer = normalizedIssuer;
      return { user, error: null, migration: true };
    }
  }

  return { user, error: null, migration: false };
}
