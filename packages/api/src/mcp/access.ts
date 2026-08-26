import { Time } from 'librechat-data-provider';
import type { IUser } from '@librechat/data-schemas';
import type { ParsedServerConfig } from './types';
import { standardCache } from '~/cache';
import { getUserRoles } from '~/mssql';
import { math } from '~/utils';

/** Cache of a user's Sapphire role ids, keyed by Azure AD object id (`idOnTheSource`). */
const roleCache = standardCache(
  'mcp_user_roles',
  math(process.env.MCP_ROLE_CACHE_TTL, Time.FIVE_MINUTES),
);

/**
 * Parses a server's `roles` CSV into normalized (trimmed, lowercased) role ids.
 * Lowercasing keeps matching case-insensitive, mirroring the Sapphire CI_AS collation.
 */
export const parseServerRoleIds = (roles?: string): string[] => {
  if (!roles) {
    return [];
  }
  return roles
    .split(',')
    .map((role) => role.trim().toLowerCase())
    .filter((role) => role.length > 0);
};

/**
 * A server is accessible when it declares no `roles` gate, or when the user holds
 * at least one of the required roles.
 */
export const canAccessMCPServer = (
  config: ParsedServerConfig,
  userRoleIds: Set<string>,
): boolean => {
  const required = parseServerRoleIds(config.roles);
  if (!required.length) {
    return true;
  }
  return required.some((roleId) => userRoleIds.has(roleId));
};

/**
 * Resolves the set of Sapphire role ids for a user, matched by Azure AD object id
 * (`idOnTheSource`). Results are cached per object id. Users without an object id
 * (e.g. local accounts) resolve to an empty set, granting only ungated servers.
 * Fails closed: on a query error `getUserRoles` returns an empty list, so gated
 * servers are denied rather than exposed.
 */
export const resolveUserMCPRoleIds = async (
  user?: Pick<IUser, 'idOnTheSource'> | null,
): Promise<Set<string>> => {
  const externalId = user?.idOnTheSource;
  if (!externalId) {
    return new Set();
  }

  const cached = (await roleCache.get(externalId)) as string[] | undefined;
  if (cached !== undefined) {
    return new Set(cached);
  }

  const roles = await getUserRoles(externalId);
  const roleIds = roles.map((role) => role.id.toLowerCase());
  await roleCache.set(externalId, roleIds);
  return new Set(roleIds);
};

/**
 * Filters a server config map down to those the user may access. Used to hide
 * role-gated servers from listings (chat menu, tools, connection status).
 */
export const filterMCPServersByRoles = (
  servers: Record<string, ParsedServerConfig>,
  userRoleIds: Set<string>,
): Record<string, ParsedServerConfig> => {
  const result: Record<string, ParsedServerConfig> = {};
  for (const [name, config] of Object.entries(servers)) {
    if (canAccessMCPServer(config, userRoleIds)) {
      result[name] = config;
    }
  }
  return result;
};

/**
 * Filters a server map for a user, resolving their roles only when at least one
 * server declares a `roles` gate. Listings are the common case and are usually
 * ungated, so this keeps a Sapphire round trip off the page-load path entirely.
 */
export const filterMCPServersForUser = async (
  servers: Record<string, ParsedServerConfig>,
  user?: Pick<IUser, 'idOnTheSource'> | null,
): Promise<Record<string, ParsedServerConfig>> => {
  const isGated = Object.values(servers).some(
    (config) => parseServerRoleIds(config.roles).length > 0,
  );
  if (!isGated) {
    return servers;
  }
  return filterMCPServersByRoles(servers, await resolveUserMCPRoleIds(user));
};

/**
 * Authoritative per-server access check for the tool-execution path. A missing
 * config or one with no `roles` gate carries nothing to enforce and short-circuits
 * to `true` without resolving the user's roles (a role-gated server always resolves
 * to a config with its `roles` list, so this cannot bypass a real gate).
 */
export const userCanAccessMCPServer = async (
  serverConfig: ParsedServerConfig | undefined,
  user?: Pick<IUser, 'idOnTheSource'> | null,
): Promise<boolean> => {
  if (!serverConfig || !parseServerRoleIds(serverConfig.roles).length) {
    return true;
  }
  const userRoleIds = await resolveUserMCPRoleIds(user);
  return canAccessMCPServer(serverConfig, userRoleIds);
};
