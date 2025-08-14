import React, { useState, useEffect } from 'react';
import { AccessRoleIds, ResourceType } from 'librechat-data-provider';
import { Settings, Users, UserCheck, Trash2, Shield } from 'lucide-react';
import {
  useGetResourcePermissionsQuery,
  useUpdateResourcePermissionsMutation,
} from 'librechat-data-provider/react-query';
import type { TPrincipal } from 'librechat-data-provider';
import {
  Button,
  Spinner,
  OGDialog,
  OGDialogTitle,
  OGDialogClose,
  OGDialogContent,
  OGDialogTrigger,
  useToastContext,
} from '@librechat/client';
import { SelectedPrincipalsList } from './PeoplePicker';
import PublicSharingToggle from './PublicSharingToggle';
import { cn, removeFocusOutlines } from '~/utils';
import { useLocalize } from '~/hooks';

export default function ManagePermissionsDialog({
  agentName,
  resourceType = ResourceType.AGENT,
  agentDbId,
  onUpdatePermissions,
}: {
  agentDbId: string;
  agentName?: string;
  resourceType?: ResourceType;
  onUpdatePermissions?: (
    shares: TPrincipal[],
    isPublic: boolean,
    publicRole: AccessRoleIds,
  ) => void;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const {
    data: permissionsData,
    isLoading: isLoadingPermissions,
    error: permissionsError,
  } = useGetResourcePermissionsQuery(resourceType, agentDbId, {
    enabled: !!agentDbId,
  });

  const updatePermissionsMutation = useUpdateResourcePermissionsMutation();

  const [managedShares, setManagedShares] = useState<TPrincipal[]>([]);
  const [managedIsPublic, setManagedIsPublic] = useState(false);
  const [managedPublicRole, setManagedPublicRole] = useState<AccessRoleIds>(
    AccessRoleIds.AGENT_VIEWER,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const currentShares: TPrincipal[] = permissionsData?.principals || [];

  const isPublic = permissionsData?.public || false;
  const publicRole = permissionsData?.publicAccessRoleId || AccessRoleIds.AGENT_VIEWER;

  useEffect(() => {
    if (permissionsData) {
      const shares = permissionsData.principals || [];
      const isPublicValue = permissionsData.public || false;
      const publicRoleValue = permissionsData.publicAccessRoleId || AccessRoleIds.AGENT_VIEWER;

      setManagedShares(shares);
      setManagedIsPublic(isPublicValue);
      setManagedPublicRole(publicRoleValue);
      setHasChanges(false);
    }
  }, [permissionsData, isModalOpen]);

  if (!agentDbId) {
    return null;
  }

  if (permissionsError) {
    return <div className="text-sm text-red-600">{localize('com_ui_permissions_failed_load')}</div>;
  }

  const handleRemoveShare = (idOnTheSource: string) => {
    setManagedShares(managedShares.filter((s) => s.idOnTheSource !== idOnTheSource));
    setHasChanges(true);
  };

  const handleRoleChange = (idOnTheSource: string, newRole: AccessRoleIds) => {
    setManagedShares(
      managedShares.map((s) =>
        s.idOnTheSource === idOnTheSource ? { ...s, accessRoleId: newRole } : s,
      ),
    );
    setHasChanges(true);
  };

  const handleSaveChanges = async () => {
    try {
      const originalSharesMap = new Map(
        currentShares.map((share) => [`${share.type}-${share.idOnTheSource}`, share]),
      );
      const managedSharesMap = new Map(
        managedShares.map((share) => [`${share.type}-${share.idOnTheSource}`, share]),
      );

      const updated = managedShares.filter((share) => {
        const key = `${share.type}-${share.idOnTheSource}`;
        const original = originalSharesMap.get(key);
        return !original || original.accessRoleId !== share.accessRoleId;
      });

      const removed = currentShares.filter((share) => {
        const key = `${share.type}-${share.idOnTheSource}`;
        return !managedSharesMap.has(key);
      });

      await updatePermissionsMutation.mutateAsync({
        resourceType,
        resourceId: agentDbId,
        data: {
          updated,
          removed,
          public: managedIsPublic,
          publicAccessRoleId: managedIsPublic ? managedPublicRole : undefined,
        },
      });

      if (onUpdatePermissions) {
        onUpdatePermissions(managedShares, managedIsPublic, managedPublicRole);
      }

      showToast({
        message: localize('com_ui_permissions_updated_success'),
        status: 'success',
      });

      setIsModalOpen(false);
    } catch (error) {
      console.error('Error updating permissions:', error);
      showToast({
        message: localize('com_ui_permissions_failed_update'),
        status: 'error',
      });
    }
  };

  const handleCancel = () => {
    setManagedShares(currentShares);
    setManagedIsPublic(isPublic);
    setManagedPublicRole(publicRole);
    setIsModalOpen(false);
  };

  const handleRevokeAll = () => {
    setManagedShares([]);
    setManagedIsPublic(false);
    setHasChanges(true);
  };
  const handlePublicToggle = (isPublic: boolean) => {
    setManagedIsPublic(isPublic);
    setHasChanges(true);
    if (!isPublic) {
      setManagedPublicRole(AccessRoleIds.AGENT_VIEWER);
    }
  };
  const handlePublicRoleChange = (role: AccessRoleIds) => {
    setManagedPublicRole(role);
    setHasChanges(true);
  };
  const totalShares = managedShares.length + (managedIsPublic ? 1 : 0);
  const originalTotalShares = currentShares.length + (isPublic ? 1 : 0);

  /** Check if there's at least one owner (user, group, or public with owner role) */
  const hasAtLeastOneOwner =
    managedShares.some((share) => share.accessRoleId === AccessRoleIds.AGENT_OWNER) ||
    (managedIsPublic && managedPublicRole === AccessRoleIds.AGENT_OWNER);

  let peopleLabel = localize('com_ui_people');
  if (managedShares.length === 1) {
    peopleLabel = localize('com_ui_person');
  }

  let buttonAriaLabel = localize('com_ui_manage_permissions_for') + ' agent';
  if (agentName != null && agentName !== '') {
    buttonAriaLabel = localize('com_ui_manage_permissions_for') + ` "${agentName}"`;
  }

  let dialogTitle = localize('com_ui_manage_permissions_for') + ' Agent';
  if (agentName != null && agentName !== '') {
    dialogTitle = localize('com_ui_manage_permissions_for') + ` "${agentName}"`;
  }

  let publicSuffix = '';
  if (managedIsPublic) {
    publicSuffix = localize('com_ui_and_public');
  }

  return (
    <OGDialog open={isModalOpen} onOpenChange={setIsModalOpen}>
      <OGDialogTrigger asChild>
        <button
          className={cn(
            'btn btn-neutral border-token-border-light relative h-9 rounded-lg font-medium',
            removeFocusOutlines,
          )}
          aria-label={buttonAriaLabel}
          type="button"
        >
          <div className="flex items-center justify-center gap-2 text-blue-500">
            <Settings className="icon-md h-4 w-4" />
            <span className="hidden sm:inline">{localize('com_ui_manage')}</span>
            {originalTotalShares > 0 && `(${originalTotalShares})`}
          </div>
        </button>
      </OGDialogTrigger>

      <OGDialogContent className="max-h-[90vh] w-11/12 overflow-y-auto md:max-w-3xl">
        <OGDialogTitle>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" />
            {dialogTitle}
          </div>
        </OGDialogTitle>

        <div className="space-y-6 p-2">
          <div className="rounded-lg bg-surface-tertiary p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-text-primary">
                  {localize('com_ui_current_access')}
                </h3>
                <p className="text-xs text-text-secondary">
                  {(() => {
                    if (totalShares === 0) {
                      return localize('com_ui_no_users_groups_access');
                    }
                    return localize('com_ui_shared_with_count', {
                      0: managedShares.length,
                      1: peopleLabel,
                      2: publicSuffix,
                    });
                  })()}
                </p>
              </div>
              {(managedShares.length > 0 || managedIsPublic) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRevokeAll}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {localize('com_ui_revoke_all')}
                </Button>
              )}
            </div>
          </div>

          {(() => {
            if (isLoadingPermissions) {
              return (
                <div className="flex items-center justify-center p-8">
                  <Spinner className="h-6 w-6" />
                  <span className="ml-2 text-sm text-text-secondary">
                    {localize('com_ui_loading_permissions')}
                  </span>
                </div>
              );
            }

            if (managedShares.length > 0) {
              return (
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-text-primary">
                    <UserCheck className="h-4 w-4" />
                    {localize('com_ui_user_group_permissions')} ({managedShares.length})
                  </h3>
                  <SelectedPrincipalsList
                    principles={managedShares}
                    onRemoveHandler={handleRemoveShare}
                    resourceType={resourceType}
                    onRoleChange={(id, newRole) => handleRoleChange(id, newRole)}
                  />
                </div>
              );
            }

            return (
              <div className="rounded-lg border-2 border-dashed border-border-light p-8 text-center">
                <Users className="mx-auto h-8 w-8 text-text-secondary" />
                <p className="mt-2 text-sm text-text-secondary">
                  {localize('com_ui_no_individual_access')}
                </p>
              </div>
            );
          })()}

          <PublicSharingToggle
            isPublic={managedIsPublic}
            publicRole={managedPublicRole}
            onPublicToggle={handlePublicToggle}
            onPublicRoleChange={handlePublicRoleChange}
          />

          <div className="flex justify-end gap-3 border-t pt-4">
            <OGDialogClose asChild>
              <Button variant="outline" onClick={handleCancel}>
                {localize('com_ui_cancel')}
              </Button>
            </OGDialogClose>
            <Button
              onClick={handleSaveChanges}
              disabled={
                updatePermissionsMutation.isLoading ||
                !hasChanges ||
                isLoadingPermissions ||
                !hasAtLeastOneOwner
              }
              className="min-w-[120px]"
            >
              {updatePermissionsMutation.isLoading ? (
                <div className="flex items-center gap-2">
                  <Spinner className="h-4 w-4" />
                  {localize('com_ui_saving')}
                </div>
              ) : (
                localize('com_ui_save_changes')
              )}
            </Button>
          </div>

          {hasChanges && (
            <div className="text-xs text-orange-600 dark:text-orange-400">
              * {localize('com_ui_unsaved_changes')}
            </div>
          )}

          {!hasAtLeastOneOwner && hasChanges && (
            <div className="text-xs text-red-600 dark:text-red-400">
              * {localize('com_ui_at_least_one_owner_required')}
            </div>
          )}
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
