import React, { useState } from 'react';
import { Share2Icon, Users, Loader, Shield, Link, CopyCheck } from 'lucide-react';
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
import { useLocalize, useCopyToClipboard } from '~/hooks';
import { usePeoplePickerPermissions, useResourcePermissionState } from '~/hooks/Sharing';
import GenericManagePermissionsDialog from './GenericManagePermissionsDialog';
import PeoplePicker from '../SidePanel/Agents/Sharing/PeoplePicker/PeoplePicker';
import AccessRolesPicker from '../SidePanel/Agents/Sharing/AccessRolesPicker';
import PublicSharingToggle from './PublicSharingToggle';
import { cn, removeFocusOutlines } from '~/utils';

export default function GenericGrantAccessDialog({
  resourceName,
  resourceDbId,
  resourceId,
  resourceType,
  onGrantAccess,
  disabled = false,
  children,
}: {
  resourceDbId?: string | null;
  resourceId?: string | null;
  resourceName?: string;
  resourceType: string;
  onGrantAccess?: (shares: TPrincipal[], isPublic: boolean, publicRole: string) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  // Use shared hooks
  const { hasPeoplePickerAccess, peoplePickerTypeFilter } = usePeoplePickerPermissions();
  const {
    config,
    updatePermissionsMutation,
    currentShares,
    currentIsPublic,
    currentPublicRole,
    isPublic,
    setIsPublic,
    publicRole,
    setPublicRole,
  } = useResourcePermissionState(resourceType, resourceDbId, isModalOpen);

  const [newShares, setNewShares] = useState<TPrincipal[]>([]);
  const [defaultPermissionId, setDefaultPermissionId] = useState<string>(
    config?.defaultViewerRoleId ?? '',
  );

  const resourceUrl = config?.getResourceUrl ? config?.getResourceUrl(resourceId || '') : '';
  const copyResourceUrl = useCopyToClipboard({ text: resourceUrl });

  if (!resourceDbId) {
    return null;
  }

  if (!config) {
    console.error(`Unsupported resource type: ${resourceType}`);
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
        resourceId: resourceDbId,
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
      setDefaultPermissionId(config?.defaultViewerRoleId);
      setIsPublic(false);
      setPublicRole(config?.defaultViewerRoleId);
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
    setDefaultPermissionId(config?.defaultViewerRoleId);
    setIsPublic(false);
    setPublicRole(config?.defaultViewerRoleId);
    setIsModalOpen(false);
  };

  const totalCurrentShares = currentShares.length + (currentIsPublic ? 1 : 0);
  const submitButtonActive =
    newShares.length > 0 || isPublic !== currentIsPublic || publicRole !== currentPublicRole;

  const TriggerComponent = children ? (
    children
  ) : (
    <button
      className={cn(
        'btn btn-neutral border-token-border-light relative h-9 rounded-lg font-medium',
        removeFocusOutlines,
      )}
      aria-label={localize('com_ui_share_var', {
        0: config?.getShareMessage(resourceName),
      })}
      type="button"
      disabled={disabled}
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
  );

  return (
    <OGDialog open={isModalOpen} onOpenChange={setIsModalOpen} modal>
      <OGDialogTrigger asChild>{TriggerComponent}</OGDialogTrigger>

      <OGDialogContent className="max-h-[90vh] w-11/12 overflow-y-auto md:max-w-3xl">
        <OGDialogTitle>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {localize('com_ui_share_var', {
              0: config?.getShareMessage(resourceName),
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
                <GenericManagePermissionsDialog
                  resourceDbId={resourceDbId}
                  resourceName={resourceName}
                  resourceType={resourceType}
                />
              )}
              {resourceId && resourceUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (isCopying) return;
                    copyResourceUrl(setIsCopying);
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
                      ? config?.getCopyUrlMessage()
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
