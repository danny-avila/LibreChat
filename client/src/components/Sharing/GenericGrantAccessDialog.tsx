import React, { useState, useEffect } from 'react';
import { AccessRoleIds, ResourceType } from 'librechat-data-provider';
import { Share2Icon, Users, Link, CopyCheck, UserX, UserCheck } from 'lucide-react';
import {
  Label,
  Button,
  Spinner,
  Skeleton,
  OGDialog,
  OGDialogTitle,
  OGDialogClose,
  OGDialogContent,
  OGDialogTrigger,
  useToastContext,
} from '@librechat/client';
import type { TPrincipal } from 'librechat-data-provider';
import {
  usePeoplePickerPermissions,
  useResourcePermissionState,
  useCopyToClipboard,
  useCanSharePublic,
  useLocalize,
} from '~/hooks';
import UnifiedPeopleSearch from './PeoplePicker/UnifiedPeopleSearch';
import PeoplePickerAdminSettings from './PeoplePickerAdminSettings';
import PublicSharingToggle from './PublicSharingToggle';
import { SelectedPrincipalsList } from './PeoplePicker';
import { cn } from '~/utils';

export default function GenericGrantAccessDialog({
  resourceName,
  resourceDbId,
  resourceId,
  resourceType,
  onGrantAccess,
  disabled = false,
  buttonClassName,
  children,
}: {
  resourceDbId?: string | null;
  resourceId?: string | null;
  resourceName?: string;
  resourceType: ResourceType;
  onGrantAccess?: (shares: TPrincipal[], isPublic: boolean, publicRole?: AccessRoleIds) => void;
  disabled?: boolean;
  buttonClassName?: string;
  children?: React.ReactNode;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [isCopying, setIsCopying] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const canSharePublic = useCanSharePublic(resourceType);
  const { hasPeoplePickerAccess, peoplePickerTypeFilter } = usePeoplePickerPermissions();

  /** User can use the share dialog if they have people picker access OR can share publicly */
  const canUseShareDialog = hasPeoplePickerAccess || canSharePublic;

  const {
    config,
    permissionsData,
    isLoadingPermissions,
    permissionsError,
    updatePermissionsMutation,
    currentShares,
    currentIsPublic,
    currentPublicRole,
    isPublic,
    setIsPublic,
    publicRole,
    setPublicRole,
  } = useResourcePermissionState(resourceType, resourceDbId, isModalOpen);

  /** State for unified list of all shares (existing + newly added) */
  const [allShares, setAllShares] = useState<TPrincipal[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [defaultPermissionId, setDefaultPermissionId] = useState<AccessRoleIds | undefined>(
    config?.defaultViewerRoleId,
  );

  // Sync all shares with current shares when modal opens, marking existing vs new
  useEffect(() => {
    if (permissionsData && isModalOpen) {
      const shares = permissionsData.principals || [];
      setAllShares(shares.map((share) => ({ ...share, isExisting: true })));
      setHasChanges(false);
    }
  }, [permissionsData, isModalOpen]);

  const resourceUrl = config?.getResourceUrl ? config?.getResourceUrl(resourceId || '') : '';
  const copyResourceUrl = useCopyToClipboard({ text: resourceUrl });

  if (!resourceDbId) {
    return null;
  }

  // Don't render if user has no useful sharing permissions
  if (!canUseShareDialog) {
    return null;
  }

  if (!config) {
    console.error(`Unsupported resource type: ${resourceType}`);
    return null;
  }

  // Handler for adding users from search (immediate add to unified list)
  const handleAddFromSearch = (newShares: TPrincipal[]) => {
    const sharesToAdd = newShares.filter(
      (newShare) =>
        !allShares.some((existing) => existing.idOnTheSource === newShare.idOnTheSource),
    );

    const sharesWithDefaults = sharesToAdd.map((share) => ({
      ...share,
      accessRoleId: defaultPermissionId || config?.defaultViewerRoleId,
      isExisting: false, // Mark as newly added
    }));

    setAllShares((prev) => [...prev, ...sharesWithDefaults]);
    setHasChanges(true);
  };

  // Handler for removing individual shares
  const handleRemoveShare = (idOnTheSource: string) => {
    setAllShares(allShares.filter((s) => s.idOnTheSource !== idOnTheSource));
    setHasChanges(true);
  };

  // Handler for changing individual share permissions
  const handleRoleChange = (idOnTheSource: string, newRole: string) => {
    setAllShares(
      allShares.map((s) =>
        s.idOnTheSource === idOnTheSource ? { ...s, accessRoleId: newRole as AccessRoleIds } : s,
      ),
    );
    setHasChanges(true);
  };

  // Handler for public access toggle
  const handlePublicToggle = (isPublicValue: boolean) => {
    setIsPublic(isPublicValue);
    setHasChanges(true);
    if (!isPublicValue) {
      setPublicRole(config?.defaultViewerRoleId);
    }
  };

  // Handler for public role change
  const handlePublicRoleChange = (role: string) => {
    setPublicRole(role as AccessRoleIds);
    setHasChanges(true);
  };

  // Save all changes (unified save handler)
  const handleSave = async () => {
    if (!allShares.length && !isPublic && !hasChanges) {
      return;
    }

    try {
      // Calculate changes for unified list
      const originalSharesMap = new Map(
        currentShares.map((share) => [`${share.type}-${share.idOnTheSource}`, share]),
      );
      const allSharesMap = new Map(
        allShares.map((share) => [`${share.type}-${share.idOnTheSource}`, share]),
      );

      // Find newly added and updated shares
      const updated = allShares.filter((share) => {
        const key = `${share.type}-${share.idOnTheSource}`;
        const original = originalSharesMap.get(key);
        return !original || original.accessRoleId !== share.accessRoleId;
      });

      // Find removed shares
      const removed = currentShares.filter((share) => {
        const key = `${share.type}-${share.idOnTheSource}`;
        return !allSharesMap.has(key);
      });

      await updatePermissionsMutation.mutateAsync({
        resourceType,
        resourceId: resourceDbId,
        data: {
          updated,
          removed,
          public: isPublic,
          publicAccessRoleId: isPublic ? publicRole : undefined,
        },
      });

      if (onGrantAccess) {
        onGrantAccess(allShares, isPublic, publicRole);
      }

      showToast({
        message: localize('com_ui_permissions_updated_success'),
        status: 'success',
      });

      setHasChanges(false);
    } catch (error) {
      console.error('Error updating permissions:', error);
      showToast({
        message: localize('com_ui_permissions_failed_update'),
        status: 'error',
      });
    }
  };

  const handleCancel = () => {
    // Reset to original state
    const shares = permissionsData?.principals || [];
    setAllShares(shares.map((share) => ({ ...share, isExisting: true })));
    setDefaultPermissionId(config?.defaultViewerRoleId);
    setIsPublic(currentIsPublic);
    setPublicRole(currentPublicRole || config?.defaultViewerRoleId || '');
    setHasChanges(false);
    setIsModalOpen(false);
  };

  // Validation and calculated values
  const totalCurrentShares = currentShares.length + (currentIsPublic ? 1 : 0);

  // Check if there's at least one owner (user, group, or public with owner role)
  const hasAtLeastOneOwner =
    allShares.some((share) => share.accessRoleId === config?.defaultOwnerRoleId) ||
    (isPublic && publicRole === config?.defaultOwnerRoleId);

  // Check if there are any changes to save
  const hasPublicChanges = isPublic !== currentIsPublic || publicRole !== currentPublicRole;
  const submitButtonActive = hasChanges || hasPublicChanges;

  // Error handling
  if (permissionsError) {
    return <div className="text-sm text-red-600">{localize('com_ui_permissions_failed_load')}</div>;
  }

  const TriggerComponent = children ? (
    children
  ) : (
    <Button
      size="sm"
      variant="outline"
      aria-label={localize('com_ui_share_var', {
        0: config?.getShareMessage(resourceName),
      })}
      type="button"
      disabled={disabled}
      className={cn('h-9', buttonClassName)}
    >
      <div className="flex min-w-[32px] items-center justify-center gap-2 text-blue-500">
        <span className="flex h-6 w-6 items-center justify-center">
          <Share2Icon className="icon-md h-4 w-4" />
        </span>
        {totalCurrentShares > 0 && (
          <Label className="cursor-pointer text-sm font-medium text-text-secondary">
            {totalCurrentShares}
          </Label>
        )}
      </div>
    </Button>
  );

  return (
    <OGDialog open={isModalOpen} onOpenChange={setIsModalOpen} modal>
      <OGDialogTrigger asChild>{TriggerComponent}</OGDialogTrigger>
      <OGDialogContent className="max-h-[90vh] w-11/12 overflow-y-auto md:max-w-3xl">
        <OGDialogTitle>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" aria-hidden="true" />
            {localize('com_ui_share_var', {
              0: config?.getShareMessage(resourceName),
            })}
          </div>
        </OGDialogTitle>

        <div className="space-y-6 p-2">
          {/* Unified Search and Management Section */}
          <div className="space-y-4">
            {/* Search Bar with Default Permission Setting */}
            {hasPeoplePickerAccess && (
              <div className="space-y-2">
                <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-text-primary">
                  <UserCheck className="h-4 w-4" aria-hidden="true" />
                  {localize('com_ui_user_group_permissions')} ( {allShares.length} )
                </h4>

                <UnifiedPeopleSearch
                  onAddPeople={handleAddFromSearch}
                  placeholder={localize('com_ui_search_people_placeholder')}
                  typeFilter={peoplePickerTypeFilter}
                  excludeIds={allShares.map((s) => s.idOnTheSource)}
                />

                {/* Unified User/Group List */}
                {(() => {
                  if (isLoadingPermissions) {
                    return (
                      <div className="flex flex-col items-center gap-2">
                        <Skeleton className="h-[62px] w-full rounded-lg" />
                        <Skeleton className="h-[62px] w-full rounded-lg" />
                      </div>
                    );
                  }

                  if (allShares.length === 0 && !hasChanges) {
                    return (
                      <div className="rounded-lg border-2 border-dashed border-border-light p-8 text-center">
                        <Users className="mx-auto h-8 w-8 text-text-primary" aria-hidden="true" />
                        <p className="mt-2 text-sm text-text-primary">
                          {localize('com_ui_no_individual_access')}
                        </p>
                        <p className="mt-1 text-xs text-text-primary">
                          {localize('com_ui_search_above_to_add_people')}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {!hasAtLeastOneOwner && hasChanges && (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-center">
                          <div className="flex items-center justify-center gap-2 text-sm text-red-600 dark:text-red-400">
                            <UserX className="h-4 w-4" aria-hidden="true" />
                            {localize('com_ui_at_least_one_owner_required')}
                          </div>
                        </div>
                      )}
                      <SelectedPrincipalsList
                        principles={allShares}
                        onRemoveHandler={handleRemoveShare}
                        resourceType={resourceType}
                        onRoleChange={(id, newRole) => handleRoleChange(id, newRole)}
                      />
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {canSharePublic && (
            <>
              <div className="flex border-t border-border-light" />

              {/* Public Access Section */}
              <PublicSharingToggle
                isPublic={isPublic}
                publicRole={publicRole}
                onPublicToggle={handlePublicToggle}
                onPublicRoleChange={handlePublicRoleChange}
                resourceType={resourceType}
              />
            </>
          )}

          {/* Footer Actions */}
          <div className="flex justify-between pt-4">
            <div className="flex gap-2">
              {resourceId && resourceUrl && (
                <Button
                  variant="outline"
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
                  {isCopying ? (
                    <CopyCheck className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Link className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <PeoplePickerAdminSettings />
              <OGDialogClose asChild>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  aria-label={localize('com_ui_cancel')}
                >
                  {localize('com_ui_cancel')}
                </Button>
              </OGDialogClose>
              <Button
                onClick={handleSave}
                disabled={
                  updatePermissionsMutation.isLoading ||
                  !submitButtonActive ||
                  (hasChanges && !hasAtLeastOneOwner)
                }
                className="min-w-[120px]"
                aria-label={localize('com_ui_save_changes')}
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
          </div>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
