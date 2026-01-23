import { logger } from '@librechat/data-schemas';
import { ErrorTypes } from 'librechat-data-provider';
import type { IUser, UserMethods } from '@librechat/data-schemas';
import { safeStringify } from '../utils/openid';

/**
 * Extracts the CN (Common Name) from an LDAP DN (Distinguished Name).
 * If the input is not a DN format string, returns the original value.
 *
 * Note: This function assumes that any string starting with "CN=" (case-insensitive)
 * is an LDAP DN. While unlikely in practice, a simple role name legitimately starting
 * with "CN=" would be treated as a DN and have its CN extracted.
 *
 * @example
 * extractCNFromDN("CN=MY-GROUP,OU=groups,O=company,C=FR") // returns "MY-GROUP"
 * extractCNFromDN("simple-role") // returns "simple-role"
 * extractCNFromDN("CN=Group\\, Inc,OU=groups") // returns "Group, Inc" (handles escaped commas)
 *
 * @param dn - The LDAP Distinguished Name or simple role name
 * @returns The extracted CN or the original string if not a DN, empty string for non-string inputs
 */
export function extractCNFromDN(dn: unknown): string {
  if (typeof dn !== 'string') {
    return '';
  }
  // Match CN= at the start (case-insensitive), capturing until the first unescaped comma
  // Handles escaped characters like \, in DN values (e.g., "CN=Group\, Inc,OU=groups")
  const match = dn.match(/^cn=((?:\\.|[^,])+)/i);
  if (match) {
    // Unescape any escaped characters (e.g., \, becomes ,)
    return match[1].replace(/\\(.)/g, '$1');
  }
  return dn;
}

/**
 * Normalizes roles by extracting CN from LDAP DNs.
 * This allows comparing simple role names like "MY-GROUP" with
 * LDAP DN values like "CN=MY-GROUP,OU=groups,O=company,C=FR".
 *
 * @param roles - The roles to normalize
 * @returns Array of normalized role names
 */
export function normalizeRoles(roles: unknown): string[] {
  if (typeof roles === 'string') {
    return [extractCNFromDN(roles)];
  }
  if (Array.isArray(roles)) {
    return roles.map(extractCNFromDN).filter(Boolean);
  }
  logger.warn(
    `[openidStrategy] Unexpected roles format, expected string or array, got "${typeof roles}": ${safeStringify(
      roles,
    )}`,
  );
  return [];
}

/**
 * Finds or migrates a user for OpenID authentication
 * @returns user object (with migration fields if needed), error message, and whether migration is needed
 */
export async function findOpenIDUser({
  openidId,
  findUser,
  email,
  idOnTheSource,
  strategyName = 'openid',
}: {
  openidId: string;
  findUser: UserMethods['findUser'];
  email?: string;
  idOnTheSource?: string;
  strategyName?: string;
}): Promise<{ user: IUser | null; error: string | null; migration: boolean }> {
  const primaryConditions = [];

  if (openidId && typeof openidId === 'string') {
    primaryConditions.push({ openidId });
  }

  if (idOnTheSource && typeof idOnTheSource === 'string') {
    primaryConditions.push({ idOnTheSource });
  }

  let user = null;
  if (primaryConditions.length > 0) {
    user = await findUser({ $or: primaryConditions });
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

    // If user found by email but doesn't have openidId, prepare for migration
    if (user && !user.openidId) {
      logger.info(
        `[${strategyName}] Preparing user ${user.email} for migration to OpenID with sub: ${openidId}`,
      );
      user.provider = 'openid';
      user.openidId = openidId;
      return { user, error: null, migration: true };
    }
  }

  return { user, error: null, migration: false };
}
