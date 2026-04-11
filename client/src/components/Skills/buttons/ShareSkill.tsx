import React from 'react';
import { Share2Icon } from 'lucide-react';
import { Button, TooltipAnchor } from '@librechat/client';
import {
  SystemRoles,
  Permissions,
  ResourceType,
  PermissionBits,
  PermissionTypes,
} from 'librechat-data-provider';
import type { TSkill } from 'librechat-data-provider';
import { useAuthContext, useHasAccess, useLocalize, useResourcePermissions } from '~/hooks';
import { GenericGrantAccessDialog } from '~/components/Sharing';

const ShareSkill = React.memo(({ skill, disabled }: { skill: TSkill; disabled?: boolean }) => {
  const { user } = useAuthContext();
  const localize = useLocalize();

  const hasAccessToShareSkills = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.SHARE,
  });

  const { hasPermission, isLoading: permissionsLoading } = useResourcePermissions(
    ResourceType.SKILL,
    skill._id,
  );

  const canShareThisSkill = hasPermission(PermissionBits.SHARE);

  const shouldShowShareButton =
    (skill.author === user?.id || user?.role === SystemRoles.ADMIN || canShareThisSkill) &&
    hasAccessToShareSkills &&
    !permissionsLoading;

  if (!shouldShowShareButton) {
    return null;
  }

  return (
    <GenericGrantAccessDialog
      resourceDbId={skill._id}
      resourceName={skill.name}
      resourceType={ResourceType.SKILL}
      disabled={disabled}
    >
      <TooltipAnchor
        description={localize('com_ui_share')}
        side="bottom"
        render={
          <Button
            variant="outline"
            size="icon"
            className="size-9 border-border-medium"
            aria-label={localize('com_ui_share')}
            disabled={disabled}
          >
            <Share2Icon className="size-5" aria-hidden="true" />
          </Button>
        }
      />
    </GenericGrantAccessDialog>
  );
});

ShareSkill.displayName = 'ShareSkill';

export default ShareSkill;
