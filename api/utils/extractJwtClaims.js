const jwtDecode = require('jsonwebtoken/decode');
const { logger } = require('@librechat/data-schemas');

/**
 * JWT Claim Extraction Utilities for OIDC Group Synchronization
 *
 * Provides safe extraction and sanitization of groups/roles from JWT tokens
 * for various OpenID Connect providers (Keycloak, Auth0, Okta, etc.)
 *
 * TODO: Future enhancements:
 * - Add claim path validation against OIDC provider metadata
 * - Add caching for frequently accessed claims
 * - Add support for nested array claims (e.g., groups[*].name)
 * - Add claim transformation functions (e.g., uppercase, prefix removal)
 */

/**
 * Splits a claim path on unescaped '.'; '\.' is treated as a literal dot so
 * namespaced OIDC claim keys (e.g. Auth0 'https://app\.example\.com/roles') resolve.
 * @param {string} claimPath
 * @returns {string[]}
 */
function splitClaimPath(claimPath) {
  const parts = [];
  let current = '';
  for (let i = 0; i < claimPath.length; i++) {
    if (claimPath[i] === '\\' && claimPath[i + 1] === '.') {
      current += '.';
      i += 1;
    } else if (claimPath[i] === '.') {
      parts.push(current);
      current = '';
    } else {
      current += claimPath[i];
    }
  }
  parts.push(current);
  return parts;
}

/**
 * Extracts a claim value from a JWT token using dot-notation path.
 * Use '\.' to embed a literal dot in a single segment (e.g. namespaced claims).
 * @param {string} token - The JWT token to decode
 * @param {string} claimPath - Dot-notation path to the claim (e.g., 'realm_access.roles')
 * @returns {Array<string>|null} Array of claim values, or null if not found
 */
function extractClaimFromToken(token, claimPath) {
  try {
    if (!token || typeof token !== 'string') {
      logger.warn('[extractClaimFromToken] Invalid token provided');
      return null;
    }

    if (!claimPath || typeof claimPath !== 'string') {
      logger.warn('[extractClaimFromToken] Invalid claim path provided');
      return null;
    }

    const decoded = jwtDecode(token);

    if (!decoded || typeof decoded !== 'object') {
      logger.warn('[extractClaimFromToken] Failed to decode token');
      return null;
    }

    const pathParts = splitClaimPath(claimPath);
    let value = decoded;

    for (const part of pathParts) {
      if (value === null || value === undefined || typeof value !== 'object') {
        logger.debug(`[extractClaimFromToken] Claim path '${claimPath}' not found in token`);
        return null;
      }
      value = value[part];
    }

    // Ensure we return an array
    if (value === null || value === undefined) {
      return null;
    }

    if (Array.isArray(value)) {
      return value.filter((item) => typeof item === 'string' && item.trim().length > 0);
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      return [value];
    }

    logger.warn(
      `[extractClaimFromToken] Claim at path '${claimPath}' is not a string or array: ${typeof value}`,
    );
    return null;
  } catch (error) {
    logger.error('[extractClaimFromToken] Error extracting claim from token:', error);
    return null;
  }
}

/**
 * Strips MongoDB operator characters and length-limits a group identifier.
 * Slashes/dots are preserved so distinct upstream groups (e.g. '/team-a' vs
 * 'team-a') don't collapse to the same idOnTheSource.
 * @param {string} groupName - The raw group name from JWT
 * @returns {string}
 */
function sanitizeGroupName(groupName) {
  if (!groupName || typeof groupName !== 'string') {
    return '';
  }

  let sanitized = groupName.trim().replace(/[${}]/g, '');

  if (sanitized.length > 100) {
    sanitized = sanitized.substring(0, 100);
    logger.warn(`[sanitizeGroupName] Group name truncated to 100 characters: ${groupName}`);
  }

  return sanitized;
}

/**
 * Checks if a group name should be excluded based on exclusion patterns.
 * Supports exact matches (case-insensitive) and regex patterns (prefix with 'regex:').
 * @param {string} groupName - The group name to check.
 * @param {string|null} exclusionPattern - Comma-separated list of exact names or regex patterns.
 * @returns {boolean} True if the group should be excluded.
 */
function shouldExcludeGroup(groupName, exclusionPattern) {
  if (!exclusionPattern || typeof exclusionPattern !== 'string') {
    return false;
  }

  const patterns = exclusionPattern
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  for (const pattern of patterns) {
    // Check if it's a regex pattern
    if (pattern.startsWith('regex:')) {
      try {
        const regexStr = pattern.substring(6); // Remove 'regex:' prefix

        // Security: Prevent ReDoS attacks by limiting regex complexity
        if (regexStr.length > 200) {
          logger.warn(
            `[shouldExcludeGroup] Regex pattern too long (${regexStr.length} chars), skipping: ${pattern.substring(0, 50)}...`,
          );
          continue;
        }

        // Security: Detect potentially dangerous regex patterns (nested quantifiers, catastrophic backtracking)
        const dangerousPatterns = /(\*\*|\+\+|\*\+|\+\*)|((\(.*\)){2,}[*+])|(\[[^\]]{100,}\])/;
        if (dangerousPatterns.test(regexStr)) {
          logger.warn(
            `[shouldExcludeGroup] Potentially dangerous regex pattern detected, skipping: ${pattern}`,
          );
          continue;
        }

        const regex = new RegExp(regexStr, 'i'); // Case-insensitive
        if (regex.test(groupName)) {
          logger.debug(
            `[shouldExcludeGroup] Excluding '${groupName}' (matched regex: ${regexStr})`,
          );
          return true;
        }
      } catch (error) {
        logger.warn(`[shouldExcludeGroup] Invalid regex pattern '${pattern}': ${error.message}`);
      }
    } else {
      // Exact match (case-insensitive)
      if (pattern.toLowerCase() === groupName.toLowerCase()) {
        logger.debug(`[shouldExcludeGroup] Excluding '${groupName}' (exact match: ${pattern})`);
        return true;
      }
    }
  }

  return false;
}

/**
 * Extracts groups from JWT token for OIDC group synchronization.
 *
 * Return values:
 *   null      - extraction failed (invalid tokenset, missing/undecodable token,
 *               wrong claim path, unexpected exception). Callers should treat
 *               this as "cannot determine memberships" and avoid destructive
 *               operations like purging existing memberships.
 *   []        - extraction succeeded but the token contains no groups (user
 *               legitimately has no roles assigned). Callers may purge.
 *   string[]  - groups successfully extracted.
 *
 * @param {Object} tokenset - OpenID token set containing access_token and id_token
 * @param {string} claimPath - Dot-notation path to groups/roles claim
 * @param {string} tokenKind - Which token to extract from ('access' or 'id')
 * @param {string|null} exclusionPattern - Optional exclusion pattern for filtering groups
 * @returns {Array<string>|null} Sanitized group names, or null on extraction failure
 */
function extractGroupsFromToken(
  tokenset,
  claimPath,
  tokenKind = 'access',
  exclusionPattern = null,
) {
  try {
    if (!tokenset || typeof tokenset !== 'object') {
      logger.warn('[extractGroupsFromToken] Invalid tokenset provided');
      return null;
    }

    const token = tokenKind === 'id' ? tokenset.id_token : tokenset.access_token;

    if (!token) {
      logger.warn(`[extractGroupsFromToken] ${tokenKind} token not found in tokenset`);
      return null;
    }

    const claimValues = extractClaimFromToken(token, claimPath);

    // null -> token couldn't be decoded or claim path didn't resolve -> failure
    if (claimValues === null) {
      logger.warn(
        `[extractGroupsFromToken] Could not resolve claim '${claimPath}' in ${tokenKind} token`,
      );
      return null;
    }

    // [] -> claim resolved but no values -> user legitimately has no groups
    if (claimValues.length === 0) {
      logger.debug(
        `[extractGroupsFromToken] No groups found in ${tokenKind} token at path: ${claimPath}`,
      );
      return [];
    }

    const sanitizedGroups = claimValues.map(sanitizeGroupName).filter((name) => name.length > 0);

    const filteredGroups = exclusionPattern
      ? sanitizedGroups.filter((g) => !shouldExcludeGroup(g, exclusionPattern))
      : sanitizedGroups;

    const uniqueGroups = [...new Set(filteredGroups)];

    const excludedCount = sanitizedGroups.length - filteredGroups.length;
    if (excludedCount > 0) {
      logger.info(
        `[extractGroupsFromToken] Excluded ${excludedCount} groups based on exclusion pattern`,
        { pattern: exclusionPattern },
      );
    }

    logger.info(
      `[extractGroupsFromToken] Extracted ${uniqueGroups.length} unique groups from ${tokenKind} token`,
      { groups: uniqueGroups },
    );

    return uniqueGroups;
  } catch (error) {
    logger.error('[extractGroupsFromToken] Error extracting groups from token:', error);
    return null;
  }
}

module.exports = {
  extractClaimFromToken,
  sanitizeGroupName,
  extractGroupsFromToken,
  shouldExcludeGroup,
};
