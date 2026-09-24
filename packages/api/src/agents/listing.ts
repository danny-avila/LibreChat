import { PermissionBits, ResourceType } from 'librechat-data-provider';
import type { IUser } from '@librechat/data-schemas';
import type { Types } from 'mongoose';
import type { AgentManagementReadDeps } from './reads';
import { hasManageAgentsCapability } from './reads';

export async function getAgentListAccess(
  user: IUser,
  requiredPermissions: PermissionBits,
  deps: Pick<AgentManagementReadDeps, 'hasCapability' | 'findAccessibleResources'>,
): Promise<{ accessibleIds: Types.ObjectId[] | null; editableIds: Types.ObjectId[] | null }> {
  if (typeof requiredPermissions !== 'number' || requiredPermissions < 1) {
    throw new Error('requiredPermissions must be a positive number');
  }
  if (await hasManageAgentsCapability(user, deps)) {
    return { accessibleIds: null, editableIds: null };
  }

  const params = {
    userId: user.id,
    role: user.role,
    idOnTheSource: user.idOnTheSource,
    resourceType: ResourceType.AGENT,
  };
  const [accessibleIds, editableIds] = await Promise.all([
    deps.findAccessibleResources({ ...params, requiredPermissions }),
    (requiredPermissions & PermissionBits.EDIT) === PermissionBits.EDIT
      ? null
      : deps.findAccessibleResources({ ...params, requiredPermissions: PermissionBits.EDIT }),
  ]);
  return { accessibleIds, editableIds };
}
