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
 * Extracts a claim value from a JWT token using dot-notation path
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

    // Navigate the claim path
    const pathParts = claimPath.split('.');
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
 * Sanitizes a group name to ensure it's safe for database storage
 * Removes or replaces characters that could cause issues in MongoDB
 * @param {string} groupName - The raw group name from JWT
 * @returns {string} Sanitized group name
 */
function sanitizeGroupName(groupName) {
  if (!groupName || typeof groupName !== 'string') {
    return '';
  }

  // Remove leading/trailing whitespace
  let sanitized = groupName.trim();

  // Remove leading slashes from hierarchical group names (e.g., /admin/users -> admin/users)
  sanitized = sanitized.replace(/^\/+/, '');

  // Replace remaining slashes with hyphens for flat structure
  sanitized = sanitized.replace(/\//g, '-');

  // Remove MongoDB operators and special characters
  sanitized = sanitized.replace(/[${}]/g, '');

  // Limit length (MongoDB field size limits)
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
 * Extracts groups from JWT token for OIDC group synchronization
 * @param {Object} tokenset - OpenID token set containing access_token and id_token
 * @param {string} claimPath - Dot-notation path to groups/roles claim
 * @param {string} tokenKind - Which token to extract from ('access' or 'id')
 * @param {string|null} exclusionPattern - Optional exclusion pattern for filtering groups
 * @returns {Array<string>} Array of sanitized group names
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
      return [];
    }

    const token = tokenKind === 'id' ? tokenset.id_token : tokenset.access_token;

    if (!token) {
      logger.warn(`[extractGroupsFromToken] ${tokenKind} token not found in tokenset`);
      return [];
    }

    const claimValues = extractClaimFromToken(token, claimPath);

    if (!claimValues || claimValues.length === 0) {
      logger.debug(
        `[extractGroupsFromToken] No groups found in ${tokenKind} token at path: ${claimPath}`,
      );
      return [];
    }

    // Sanitize all group names
    const sanitizedGroups = claimValues.map(sanitizeGroupName).filter((name) => name.length > 0);

    // Apply exclusion filter
    const filteredGroups = exclusionPattern
      ? sanitizedGroups.filter((g) => !shouldExcludeGroup(g, exclusionPattern))
      : sanitizedGroups;

    // Remove duplicates
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
    return [];
  }
}

module.exports = {
  extractClaimFromToken,
  sanitizeGroupName,
  extractGroupsFromToken,
  shouldExcludeGroup,
};
