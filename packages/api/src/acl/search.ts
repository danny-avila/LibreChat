import { logger } from '@librechat/data-schemas';
import { Permissions, SystemRoles, PrincipalType, PermissionTypes } from 'librechat-data-provider';
import type { NextFunction, Response } from 'express';
import type { IRole } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types';

export type SearchablePrincipalType = PrincipalType.USER | PrincipalType.GROUP | PrincipalType.ROLE;

export type EntraPrincipalSearchType = 'all' | 'users' | 'groups';

export type PrincipalSearchRequest = ServerRequest & {
  /** Principal types the caller may search, resolved by the people picker access check. */
  principalSearchTypes?: SearchablePrincipalType[];
};

export type PeoplePickerAccess = (
  req: PrincipalSearchRequest,
  res: Response,
  next: NextFunction,
) => Promise<Response | void>;

type PeoplePickerRole = Pick<IRole, 'permissions'>;

const SEARCHABLE_PRINCIPAL_TYPES: readonly SearchablePrincipalType[] = [
  PrincipalType.USER,
  PrincipalType.GROUP,
  PrincipalType.ROLE,
];

const PRINCIPAL_SEARCH_PERMISSIONS: Record<
  SearchablePrincipalType,
  {
    permission: Permissions.VIEW_USERS | Permissions.VIEW_GROUPS | Permissions.VIEW_ROLES;
    label: string;
  }
> = {
  [PrincipalType.USER]: { permission: Permissions.VIEW_USERS, label: 'users' },
  [PrincipalType.GROUP]: { permission: Permissions.VIEW_GROUPS, label: 'groups' },
  [PrincipalType.ROLE]: { permission: Permissions.VIEW_ROLES, label: 'roles' },
};

const isSearchablePrincipalType = (value: string): value is SearchablePrincipalType =>
  (SEARCHABLE_PRINCIPAL_TYPES as readonly string[]).includes(value);

/**
 * Collects the principal types named by the `type` and `types` query parameters, in request order.
 * Each value may be a single type, a comma-separated list, or a repeated parameter.
 */
export function getRequestedPrincipalTypes(
  query: PrincipalSearchRequest['query'],
): SearchablePrincipalType[] {
  const requested = new Set<SearchablePrincipalType>();
  for (const value of [query.type, query.types].flat()) {
    if (typeof value !== 'string') {
      continue;
    }
    for (const name of value.split(',')) {
      if (isSearchablePrincipalType(name)) {
        requested.add(name);
      }
    }
  }
  return [...requested];
}

/** Maps resolved principal types to the Microsoft Graph search scope, or `null` when none apply. */
export function getEntraPrincipalSearchType(
  types: readonly SearchablePrincipalType[],
): EntraPrincipalSearchType | null {
  const users = types.includes(PrincipalType.USER);
  const groups = types.includes(PrincipalType.GROUP);
  if (users && groups) {
    return 'all';
  }
  if (users) {
    return 'users';
  }
  return groups ? 'groups' : null;
}

/**
 * Creates the people picker access check. It resolves the principal types the caller may search —
 * the requested types when every one is permitted, otherwise every permitted type — and stores
 * them on `req.principalSearchTypes` for the search handler.
 */
export function createPeoplePickerAccess({
  getRoleByName,
}: {
  getRoleByName: (roleName: string) => Promise<PeoplePickerRole | null>;
}): PeoplePickerAccess {
  return async (req, res, next) => {
    try {
      const user = req.user;
      if (!user || !user.role) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
      }

      const requested = getRequestedPrincipalTypes(req.query);

      if (user.role === SystemRoles.ADMIN) {
        req.principalSearchTypes =
          requested.length > 0 ? requested : [...SEARCHABLE_PRINCIPAL_TYPES];
        return next();
      }

      const role = await getRoleByName(user.role);
      if (!role || !role.permissions) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'No permissions configured for user role',
        });
      }

      const peoplePickerPerms = role.permissions[PermissionTypes.PEOPLE_PICKER] ?? {};
      const canSearch = (type: SearchablePrincipalType) =>
        peoplePickerPerms[PRINCIPAL_SEARCH_PERMISSIONS[type].permission] === true;

      const denied = requested.find((type) => !canSearch(type));
      if (denied) {
        return res.status(403).json({
          error: 'Forbidden',
          message: `Insufficient permissions to search for ${PRINCIPAL_SEARCH_PERMISSIONS[denied].label}`,
        });
      }

      const types = requested.length > 0 ? requested : SEARCHABLE_PRINCIPAL_TYPES.filter(canSearch);
      if (types.length === 0) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Insufficient permissions to search for users, groups, or roles',
        });
      }

      req.principalSearchTypes = types;
      return next();
    } catch (error) {
      logger.error(
        `[checkPeoplePickerAccess][${req.user?.id}] error for type=${req.query.type}, types=${req.query.types}`,
        error,
      );
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to check permissions',
      });
    }
  };
}
