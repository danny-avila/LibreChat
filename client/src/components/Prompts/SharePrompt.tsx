import React from 'react';
import { Share2Icon } from 'lucide-react';
import {
  SystemRoles,
  Permissions,
  ResourceType,
  PermissionBits,
  PermissionTypes,
} from 'librechat-data-provider';
import { Button } from '@librechat/client';
import type { TPromptGroup } from 'librechat-data-provider';
import { useAuthContext, useHasAccess, useResourcePermissions } from '~/hooks';
import { GenericGrantAccessDialog } from '~/components/Sharing';

const SharePrompt = React.memo(
  ({ group, disabled }: { group?: TPromptGroup; disabled: boolean }) => {
    const { user } = useAuthContext();

    // Check if user has permission to share prompts globally
    const hasAccessToSharePrompts = useHasAccess({
      permissionType: PermissionTypes.PROMPTS,
      permission: Permissions.SHARED_GLOBAL,
    });

    // Check user's permissions on this specific promptGroup
    // The query will be disabled if groupId is empty
    const groupId = group?._id || '';
    const { hasPermission, isLoading: permissionsLoading } = useResourcePermissions(
      ResourceType.PROMPTGROUP,
      groupId,
    );

    // Early return if no group
    if (!group || !groupId) {
      return null;
    }

    const canShareThisPrompt = hasPermission(PermissionBits.SHARE);

    const shouldShowShareButton =
      (group.author === user?.id || user?.role === SystemRoles.ADMIN || canShareThisPrompt) &&
      hasAccessToSharePrompts &&
      !permissionsLoading;

    if (!shouldShowShareButton) {
      return null;
    }

    return (
      <GenericGrantAccessDialog
        resourceDbId={groupId}
        resourceName={group.name}
        resourceType={ResourceType.PROMPTGROUP}
        disabled={disabled}
      >
        <Button
          variant="default"
          size="sm"
          aria-label="Share prompt"
          className="h-10 w-10 border border-transparent bg-blue-500/90 p-0.5 transition-all hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-800"
          disabled={disabled}
        >
          <Share2Icon className="size-5 cursor-pointer text-white" aria-hidden="true" />
        </Button>
      </GenericGrantAccessDialog>
    );
  },
);

SharePrompt.displayName = 'SharePrompt';

export default SharePrompt;
