const ROLES_ROOT = '/api/admin/roles';

/** `parsePagination` caps `limit` at 200 (packages/api/src/admin/pagination.ts). */
export const ROLES_PAGE_LIMIT = 50;
export const MEMBERS_PAGE_LIMIT = 50;

/** A selector offers every role at once, so it asks for the whole cap in one request. */
export const ROLE_OPTIONS_LIMIT = 200;

/** `GET` lists and `POST` creates on the collection itself. */
export const rolesRootPath = (): string => ROLES_ROOT;

export const rolesListPath = (limit: number, offset: number): string =>
  `${ROLES_ROOT}?limit=${limit}&offset=${offset}`;

export const rolePath = (name: string): string => `${ROLES_ROOT}/${encodeURIComponent(name)}`;

export const rolePermissionsPath = (name: string): string => `${rolePath(name)}/permissions`;

/** `GET` lists and `POST` adds on the membership collection. */
export const roleMembersPath = (name: string): string => `${rolePath(name)}/members`;

export const roleMembersListPath = (name: string, limit: number, offset: number): string =>
  `${roleMembersPath(name)}?limit=${limit}&offset=${offset}`;

export const roleMemberPath = (name: string, userId: string): string =>
  `${roleMembersPath(name)}/${encodeURIComponent(userId)}`;
