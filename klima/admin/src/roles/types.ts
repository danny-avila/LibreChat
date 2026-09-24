import type { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { AdminMember } from '@librechat/data-schemas';

/** `listRoles` selects only `name description` (packages/data-schemas/src/methods/role.ts). */
export interface AdminRole {
  _id: string;
  name: string;
  description?: string;
}

/** `GET /api/admin/roles` → `{ roles, total, limit, offset }`. */
export interface AdminRolesResponse {
  roles: AdminRole[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * The bits a role holds, per permission type. A missing type or bit is a role that never
 * carried it: the DB stores only what was written, so the editor renders those as off.
 */
export type RolePermissions = Partial<
  Record<PermissionTypes, Partial<Record<Permissions, boolean>>>
>;

/** `GET /api/admin/roles/:name` → `{ role }`, the whole stored document. */
export interface AdminRoleDetail extends AdminRole {
  permissions?: RolePermissions;
  tenantId?: string;
}

/** `POST /api/admin/roles`, `PATCH /api/admin/roles/:name` and the permissions route all answer `{ role }`. */
export interface AdminRoleResponse {
  role: AdminRoleDetail;
}

/** `GET /api/admin/roles/:name/members` → `{ members, total, limit, offset }`. */
export interface AdminRoleMembersResponse {
  members: AdminMember[];
  total: number;
  limit: number;
  offset: number;
}

/** `POST /api/admin/roles` body. `permissions` is accepted at creation but stays `{}` here: the matrix is edited after the role exists. */
export interface CreateRoleBody {
  name: string;
  description?: string;
}

/** `PATCH /api/admin/roles/:name` body. A `name` equal to the current one is not a rename. */
export interface UpdateRoleBody {
  name?: string;
  description?: string;
}

/** `PATCH /api/admin/roles/:name/permissions` body. */
export interface UpdatePermissionsBody {
  permissions: RolePermissions;
}

/** `POST /api/admin/roles/:name/members` body. */
export interface AddMemberBody {
  userId: string;
}

/** The member routes and `DELETE /api/admin/roles/:name` answer `{ success: true }`. */
export interface AdminRoleSuccessResponse {
  success?: boolean;
}
