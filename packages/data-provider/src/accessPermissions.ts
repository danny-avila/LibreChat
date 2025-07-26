import { z } from 'zod';

/**
 * Granular Permission System Types for Agent Sharing
 *
 * This file contains TypeScript interfaces and Zod schemas for the enhanced
 * agent permission system that supports sharing with specific users/groups
 * and Entra ID integration.
 */

// ===== ENUMS & CONSTANTS =====

/**
 * Principal types for permission system
 */
export type TPrincipalType = 'user' | 'group' | 'public';

/**
 * Source of the principal (local LibreChat or external Entra ID)
 */
export type TPrincipalSource = 'local' | 'entra';

/**
 * Access levels for agents
 */
export type TAccessLevel = 'none' | 'viewer' | 'editor' | 'owner';

/**
 * Permission bit constants for bitwise operations
 */
export const PERMISSION_BITS = {
  VIEW: 1, // 001 - Can view and use agent
  EDIT: 2, // 010 - Can modify agent settings
  DELETE: 4, // 100 - Can delete agent
  SHARE: 8, // 1000 - Can share agent with others (future)
} as const;

/**
 * Standard access role IDs
 */
export const ACCESS_ROLE_IDS = {
  AGENT_VIEWER: 'agent_viewer',
  AGENT_EDITOR: 'agent_editor',
  AGENT_OWNER: 'agent_owner', // Future use
  PROMPT_VIEWER: 'prompt_viewer',
  PROMPT_EDITOR: 'prompt_editor',
  PROMPT_OWNER: 'prompt_owner',
} as const;

// ===== ZOD SCHEMAS =====

/**
 * Principal schema - represents a user, group, or public access
 */
export const principalSchema = z.object({
  type: z.enum(['user', 'group', 'public']),
  id: z.string().optional(), // undefined for 'public' type
  name: z.string().optional(),
  email: z.string().optional(), // for user and group types
  source: z.enum(['local', 'entra']).optional(),
  avatar: z.string().optional(), // for user and group types
  description: z.string().optional(), // for group type
  idOnTheSource: z.string().optional(), // Entra ID for users/groups
  accessRoleId: z.string().optional(), // Access role ID for permissions
  memberCount: z.number().optional(), // for group type
});

/**
 * Access role schema - defines named permission sets
 */
export const accessRoleSchema = z.object({
  accessRoleId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  resourceType: z.string().default('agent'),
  permBits: z.number(),
});

/**
 * Permission entry schema - represents a single ACL entry
 */
export const permissionEntrySchema = z.object({
  id: z.string(),
  principalType: z.enum(['user', 'group', 'public']),
  principalId: z.string().optional(), // undefined for 'public'
  principalName: z.string().optional(),
  role: accessRoleSchema,
  grantedBy: z.string(),
  grantedAt: z.string(), // ISO date string
  inheritedFrom: z.string().optional(), // for project-level inheritance
  source: z.enum(['local', 'entra']).optional(),
});

/**
 * Resource permissions response schema
 */
export const resourcePermissionsResponseSchema = z.object({
  resourceType: z.string(),
  resourceId: z.string(),
  permissions: z.array(permissionEntrySchema),
});

/**
 * Update resource permissions request schema
 * This matches the user's requirement for the frontend DTO structure
 */
export const updateResourcePermissionsRequestSchema = z.object({
  updated: principalSchema.array(),
  removed: principalSchema.array(),
  public: z.boolean(),
  publicAccessRoleId: z.string().optional(),
});

/**
 * Update resource permissions response schema
 * Returns the updated permissions with accessRoleId included
 */
export const updateResourcePermissionsResponseSchema = z.object({
  message: z.string(),
  results: z.object({
    principals: principalSchema.array(),
    public: z.boolean(),
    publicAccessRoleId: z.string().optional(),
  }),
});

// ===== TYPESCRIPT TYPES =====

/**
 * Principal - represents a user, group, or public access
 */
export type TPrincipal = z.infer<typeof principalSchema>;

/**
 * Access role - defines named permission sets
 */
export type TAccessRole = z.infer<typeof accessRoleSchema>;

/**
 * Permission entry - represents a single ACL entry
 */
export type TPermissionEntry = z.infer<typeof permissionEntrySchema>;

/**
 * Resource permissions response
 */
export type TResourcePermissionsResponse = z.infer<typeof resourcePermissionsResponseSchema>;

/**
 * Update resource permissions request
 * This matches the user's requirement for the frontend DTO structure
 */
export type TUpdateResourcePermissionsRequest = z.infer<
  typeof updateResourcePermissionsRequestSchema
>;

/**
 * Update resource permissions response
 * Returns the updated permissions with accessRoleId included
 */
export type TUpdateResourcePermissionsResponse = z.infer<
  typeof updateResourcePermissionsResponseSchema
>;

/**
 * Principal search request parameters
 */
export type TPrincipalSearchParams = {
  q: string; // search query (required)
  limit?: number; // max results (1-50, default 10)
  type?: 'user' | 'group'; // filter by type (optional)
};

/**
 * Principal search result item
 */
export type TPrincipalSearchResult = {
  id?: string | null; // null for Entra ID principals that don't exist locally yet
  type: 'user' | 'group';
  name: string;
  email?: string; // for users and groups
  username?: string; // for users
  avatar?: string; // for users and groups
  provider?: string; // for users
  source: 'local' | 'entra';
  memberCount?: number; // for groups
  description?: string; // for groups
  idOnTheSource?: string; // Entra ID for users (maps to openidId) and groups (maps to idOnTheSource)
};

/**
 * Principal search response
 */
export type TPrincipalSearchResponse = {
  query: string;
  limit: number;
  type?: 'user' | 'group';
  results: TPrincipalSearchResult[];
  count: number;
  sources: {
    local: number;
    entra: number;
  };
};

/**
 * Available roles response
 */
export type TAvailableRolesResponse = {
  resourceType: string;
  roles: TAccessRole[];
};

/**
 * Get resource permissions response schema
 * This matches the enhanced aggregation-based endpoint response format
 */
export const getResourcePermissionsResponseSchema = z.object({
  resourceType: z.string(),
  resourceId: z.string(),
  principals: z.array(principalSchema),
  public: z.boolean(),
  publicAccessRoleId: z.string().optional(),
});

/**
 * Get resource permissions response type
 * This matches the enhanced aggregation-based endpoint response format
 */
export type TGetResourcePermissionsResponse = z.infer<typeof getResourcePermissionsResponseSchema>;

/**
 * Effective permissions response schema
 * Returns just the permission bitmask for a user on a resource
 */
export const effectivePermissionsResponseSchema = z.object({
  permissionBits: z.number(),
});

/**
 * Effective permissions response type
 * Returns just the permission bitmask for a user on a resource
 */
export type TEffectivePermissionsResponse = z.infer<typeof effectivePermissionsResponseSchema>;

// ===== UTILITY TYPES =====

/**
 * Permission check result
 */
export interface TPermissionCheck {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canShare: boolean;
  accessLevel: TAccessLevel;
}

// ===== HELPER FUNCTIONS =====

/**
 * Convert permission bits to access level
 */
export function permBitsToAccessLevel(permBits: number): TAccessLevel {
  if ((permBits & PERMISSION_BITS.DELETE) > 0) return 'owner';
  if ((permBits & PERMISSION_BITS.EDIT) > 0) return 'editor';
  if ((permBits & PERMISSION_BITS.VIEW) > 0) return 'viewer';
  return 'none';
}

/**
 * Convert access role ID to permission bits
 */
export function accessRoleToPermBits(accessRoleId: string): number {
  switch (accessRoleId) {
    case ACCESS_ROLE_IDS.AGENT_VIEWER:
      return PERMISSION_BITS.VIEW;
    case ACCESS_ROLE_IDS.AGENT_EDITOR:
      return PERMISSION_BITS.VIEW | PERMISSION_BITS.EDIT;
    case ACCESS_ROLE_IDS.AGENT_OWNER:
      return PERMISSION_BITS.VIEW | PERMISSION_BITS.EDIT | PERMISSION_BITS.DELETE;
    default:
      return PERMISSION_BITS.VIEW;
  }
}

/**
 * Check if permission bitmask contains other bitmask
 * @param permissions - The permission bitmask to check
 * @param requiredPermission - The required permission bit(s)
 * @returns {boolean} Whether permissions contains requiredPermission
 */
export function hasPermissions(permissions: number, requiredPermission: number): boolean {
  return (permissions & requiredPermission) === requiredPermission;
}
