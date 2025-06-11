import React, { useState, useEffect, useMemo } from 'react';
import { ACCESS_ROLE_IDS, PermissionTypes } from 'librechat-data-provider';
import { Share2Icon, Users, Loader, Shield, Link, CopyCheck } from 'lucide-react';
import {
  useGetResourcePermissionsQuery,
  useUpdateResourcePermissionsMutation,
} from 'librechat-data-provider/react-query';
import {
  Button,
  OGDialog,
  OGDialogTitle,
  OGDialogClose,
  OGDialogContent,
  OGDialogTrigger,
  useToastContext,
} from '@librechat/client';
import type { TPrincipal } from 'librechat-data-provider';
import { useLocalize, useCopyToClipboard, useHasAccess } from '~/hooks';
import ManagePermissionsDialog from './ManagePermissionsDialog';
import PublicSharingToggle from './PublicSharingToggle';
import PeoplePicker from './PeoplePicker/PeoplePicker';
import AccessRolesPicker from './AccessRolesPicker';
import { cn, removeFocusOutlines } from '~/utils';

export default function GrantAccessDialog({
  agentName,
  onGrantAccess,
  resourceType = 'agent',
  agentDbId,
  agentId,
}: {
  agentDbId?: string | null;
  agentId?: string | null;
  agentName?: string;
  onGrantAccess?: (shares: TPrincipal[], isPublic: boolean, publicRole: string) => void;
  resourceType?: string;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  // Check if user has permission to access people picker
  const canViewUsers = useHasAccess({
    permissionType: PermissionTypes.PEOPLE_PICKER,
    permission: Permissions.VIEW_USERS,
  });
  const canViewGroups = useHasAccess({
    permissionType: PermissionTypes.PEOPLE_PICKER,
    permission: Permissions.VIEW_GROUPS,
  });
  const hasPeoplePickerAccess = canViewUsers || canViewGroups;

  // Determine type filter based on permissions
  const peoplePickerTypeFilter = useMemo(() => {
    if (canViewUsers && canViewGroups) {
      return null; // Both types allowed
    } else if (canViewUsers) {
      return 'user' as const;
    } else if (canViewGroups) {
      return 'group' as const;
    }
    return null;
  }, [canViewUsers, canViewGroups]);

  const {
    data: permissionsData,
    // isLoading: isLoadingPermissions,
    // error: permissionsError,
  } = useGetResourcePermissionsQuery(resourceType, agentDbId!, {
    enabled: !!agentDbId,
  });

  const updatePermissionsMutation = useUpdateResourcePermissionsMutation();

  const [newShares, setNewShares] = useState<TPrincipal[]>([]);
  const [defaultPermissionId, setDefaultPermissionId] = useState<string>(
    ACCESS_ROLE_IDS.AGENT_VIEWER,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  const agentUrl = `${window.location.origin}/c/new?agent_id=${agentId}`;
  const copyAgentUrl = useCopyToClipboard({ text: agentUrl });

  const currentShares: TPrincipal[] =
    permissionsData?.principals?.map((principal) => ({
      type: principal.type,
      id: principal.id,
      name: principal.name,
      email: principal.email,
      source: principal.source,
      avatar: principal.avatar,
      description: principal.description,
      accessRoleId: principal.accessRoleId,
    })) || [];

  const currentIsPublic = permissionsData?.public ?? false;
  const currentPublicRole = permissionsData?.publicAccessRoleId || ACCESS_ROLE_IDS.AGENT_VIEWER;

  const [isPublic, setIsPublic] = useState(false);
  const [publicRole, setPublicRole] = useState<string>(ACCESS_ROLE_IDS.AGENT_VIEWER);

  useEffect(() => {
    if (permissionsData && isModalOpen) {
      setIsPublic(currentIsPublic ?? false);
      setPublicRole(currentPublicRole);
    }
  }, [permissionsData, isModalOpen, currentIsPublic, currentPublicRole]);

  if (!agentDbId) {
    return null;
  }

  const handleGrantAccess = async () => {
    try {
      const sharesToAdd = newShares.map((share) => ({
        ...share,
        accessRoleId: defaultPermissionId,
      }));

      const allShares = [...currentShares, ...sharesToAdd];

      await updatePermissionsMutation.mutateAsync({
        resourceType,
        resourceId: agentDbId,
        data: {
          updated: sharesToAdd,
          removed: [],
          public: isPublic,
          publicAccessRoleId: isPublic ? publicRole : undefined,
        },
      });

      if (onGrantAccess) {
        onGrantAccess(allShares, isPublic, publicRole);
      }

      showToast({
        message: `Access granted successfully to ${newShares.length} ${newShares.length === 1 ? 'person' : 'people'}${isPublic ? ' and made public' : ''}`,
        status: 'success',
      });

      setNewShares([]);
      setDefaultPermissionId(ACCESS_ROLE_IDS.AGENT_VIEWER);
      setIsPublic(false);
      setPublicRole(ACCESS_ROLE_IDS.AGENT_VIEWER);
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error granting access:', error);
      showToast({
        message: 'Failed to grant access. Please try again.',
        status: 'error',
      });
    }
  };

  const handleCancel = () => {
    setNewShares([]);
    setDefaultPermissionId(ACCESS_ROLE_IDS.AGENT_VIEWER);
    setIsPublic(false);
    setPublicRole(ACCESS_ROLE_IDS.AGENT_VIEWER);
    setIsModalOpen(false);
  };

  const totalCurrentShares = currentShares.length + (currentIsPublic ? 1 : 0);
  const submitButtonActive =
    newShares.length > 0 || isPublic !== currentIsPublic || publicRole !== currentPublicRole;
  return (
    <OGDialog open={isModalOpen} onOpenChange={setIsModalOpen} modal>
      <OGDialogTrigger asChild>
        <button
          className={cn(
            'btn btn-neutral border-token-border-light relative h-9 rounded-lg font-medium',
            removeFocusOutlines,
          )}
          aria-label={localize('com_ui_share_var', {
            0: agentName != null && agentName !== '' ? `"${agentName}"` : localize('com_ui_agent'),
          })}
          type="button"
        >
          <div className="flex items-center justify-center gap-2 text-blue-500">
            <Share2Icon className="icon-md h-4 w-4" />
            {totalCurrentShares > 0 && (
              <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                {totalCurrentShares}
              </span>
            )}
          </div>
        </button>
      </OGDialogTrigger>

      <OGDialogContent className="max-h-[90vh] w-11/12 overflow-y-auto md:max-w-3xl">
        <OGDialogTitle>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {localize('com_ui_share_var', {
              0:
                agentName != null && agentName !== '' ? `"${agentName}"` : localize('com_ui_agent'),
            })}
          </div>
        </OGDialogTitle>

        <div className="space-y-6 p-2">
          {hasPeoplePickerAccess && (
            <>
              <PeoplePicker
                onSelectionChange={setNewShares}
                placeholder={localize('com_ui_search_people_placeholder')}
                typeFilter={peoplePickerTypeFilter}
              />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-text-secondary" />
                    <label className="text-sm font-medium text-text-primary">
                      {localize('com_ui_permission_level')}
                    </label>
                  </div>
                </div>
                <AccessRolesPicker
                  resourceType={resourceType}
                  selectedRoleId={defaultPermissionId}
                  onRoleChange={setDefaultPermissionId}
                />
              </div>
            </>
          )}
          <PublicSharingToggle
            isPublic={isPublic}
            publicRole={publicRole}
            onPublicToggle={setIsPublic}
            onPublicRoleChange={setPublicRole}
            resourceType={resourceType}
          />
          <div className="flex justify-between border-t pt-4">
            <div className="flex gap-2">
              {hasPeoplePickerAccess && (
                <ManagePermissionsDialog
                  agentDbId={agentDbId}
                  agentName={agentName}
                  resourceType={resourceType}
                />
              )}
              {agentId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (isCopying) return;
                    copyAgentUrl(setIsCopying);
                    showToast({
                      message: localize('com_ui_agent_url_copied'),
                      status: 'success',
                    });
                  }}
                  disabled={isCopying}
                  className={cn('shrink-0', isCopying ? 'cursor-default' : '')}
                  aria-label={localize('com_ui_copy_url_to_clipboard')}
                  title={
                    isCopying
                      ? localize('com_ui_agent_url_copied')
                      : localize('com_ui_copy_url_to_clipboard')
                  }
                >
                  {isCopying ? <CopyCheck className="h-4 w-4" /> : <Link className="h-4 w-4" />}
                </Button>
              )}
            </div>
            <div className="flex gap-3">
              <OGDialogClose asChild>
                <Button variant="outline" onClick={handleCancel}>
                  {localize('com_ui_cancel')}
                </Button>
              </OGDialogClose>
              <Button
                onClick={handleGrantAccess}
                disabled={updatePermissionsMutation.isLoading || !submitButtonActive}
                className="min-w-[120px]"
              >
                {updatePermissionsMutation.isLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader className="h-4 w-4 animate-spin" />
                    {localize('com_ui_granting')}
                  </div>
                ) : (
                  localize('com_ui_grant_access')
                )}
              </Button>
            </div>
          </div>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
