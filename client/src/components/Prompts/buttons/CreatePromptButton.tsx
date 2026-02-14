import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, TooltipAnchor } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useHasAccess, useLocalize } from '~/hooks';

export default function CreatePromptButton() {
  const localize = useLocalize();
  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.CREATE,
  });

  if (!hasCreateAccess) {
    return null;
  }

  return (
    <TooltipAnchor
      description={localize('com_ui_create_prompt')}
      side="bottom"
      render={
        <Button asChild size="icon" variant="outline" aria-label={localize('com_ui_create_prompt')}>
          <Link to="/d/prompts/new">
            <Plus className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      }
    ></TooltipAnchor>
  );
}
