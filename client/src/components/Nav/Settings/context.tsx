import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import usePersonalizationAccess from '~/hooks/usePersonalizationAccess';
import { useHasAccess, useAuthContext } from '~/hooks';
import type { SettingsContextValue } from './types';

export function useSettingsContext(): SettingsContextValue {
  const { user } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const { hasAnyPersonalizationFeature, hasMemoryOptOut } = usePersonalizationAccess();

  const hasRemoteAgents = useHasAccess({
    permissionType: PermissionTypes.REMOTE_AGENTS,
    permission: Permissions.USE,
  });
  const hasMultiConvo = useHasAccess({
    permissionType: PermissionTypes.MULTI_CONVO,
    permission: Permissions.USE,
  });
  const hasPrompts = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.USE,
  });

  return {
    balanceEnabled: startupConfig?.balance?.enabled === true,
    hasAnyPersonalizationFeature,
    hasMemoryOptOut,
    hasRemoteAgents: hasRemoteAgents === true,
    hasMultiConvo: hasMultiConvo === true,
    hasPrompts: hasPrompts === true,
    isLocalProvider: user?.provider === 'local',
    twoFactorEnabled: user?.twoFactorEnabled === true,
    allowAccountDeletion: startupConfig?.allowAccountDeletion !== false,
  };
}
