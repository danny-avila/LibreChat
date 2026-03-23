import { Plus } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Button, TooltipAnchor } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useHasAccess, useLocalize } from '~/hooks';

export default function CreatePromptButton() {
  const localize = useLocalize();
  const location = useLocation();
  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.CREATE,
  });

  if (!hasCreateAccess) {
    return null;
  }

  const isChatRoute =
    location.pathname?.startsWith('/c/') || location.pathname?.startsWith('/prompts');
  const target = isChatRoute ? '/prompts/new' : '/d/prompts/new';

  return (
    <TooltipAnchor
      description={localize('com_ui_create_prompt')}
      side="bottom"
      render={
        <Button
          asChild
          variant="outline"
          size="icon"
          className="size-9 shrink-0 bg-transparent"
          aria-label={localize('com_ui_create_prompt')}
        >
          <Link to={target}>
            <Plus className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      }
    />
  );
}
