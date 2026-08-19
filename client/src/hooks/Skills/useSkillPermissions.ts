import { useMemo } from 'react';
import { ResourceType, PermissionBits, SystemRoles } from 'librechat-data-provider';
import type { TSkill, TSkillSummary } from 'librechat-data-provider';
import useResourcePermissions from '~/hooks/useResourcePermissions';
import { useAuthContext } from '~/hooks/AuthContext';

export interface SkillPermissions {
  /** Permission query is still resolving */
  isLoading: boolean;
  /** Caller is the original author */
  isOwner: boolean;
  /** Caller has the ADMIN system role */
  isAdmin: boolean;
  /** Caller can modify the skill body/description/name */
  canEdit: boolean;
  /** Caller can delete the skill entirely */
  canDelete: boolean;
  /** Caller can grant ACL access to other principals */
  canShare: boolean;
}

/**
 * Single source of truth for per-skill permission checks. Used by every
 * edit/delete/share/file-tree UI so the permission model stays consistent.
 *
 * Precedence: owner or admin → full control. Otherwise falls back to the
 * ACL bits returned by `useResourcePermissions`.
 */
export default function useSkillPermissions(
  skill: TSkill | TSkillSummary | undefined,
): SkillPermissions {
  const { user } = useAuthContext();
  const { hasPermission, isLoading } = useResourcePermissions(ResourceType.SKILL, skill?._id ?? '');

  return useMemo<SkillPermissions>(() => {
    const isOwner = skill != null && skill.author === user?.id;
    const isAdmin = user?.role === SystemRoles.ADMIN;
    const privileged = isOwner || isAdmin;

    return {
      isLoading,
      isOwner,
      isAdmin,
      canEdit: privileged || hasPermission(PermissionBits.EDIT),
      canDelete: privileged || hasPermission(PermissionBits.DELETE),
      canShare: privileged || hasPermission(PermissionBits.SHARE),
    };
  }, [skill, user?.id, user?.role, hasPermission, isLoading]);
}
