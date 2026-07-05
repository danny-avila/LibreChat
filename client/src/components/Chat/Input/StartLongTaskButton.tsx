import { memo } from 'react';
import { useWatch } from 'react-hook-form';
import { ListChecks } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import { useChatFormContext } from '~/Providers';
import { useHasAccess, useLocalize, useStartLongTask } from '~/hooks';
import { cn } from '~/utils';

type StartLongTaskButtonProps = {
  conversation: TConversation | null | undefined;
  disabled?: boolean;
};

export default memo(function StartLongTaskButton({
  conversation,
  disabled = false,
}: StartLongTaskButtonProps) {
  const localize = useLocalize();
  const methods = useChatFormContext();
  const { startLongTask, isStarting } = useStartLongTask();
  const text = useWatch({ control: methods.control, name: 'text' });

  const hasAccess = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });

  if (!hasAccess) {
    return null;
  }

  const isDisabled = disabled || isStarting || !text?.trim();

  return (
    <TooltipAnchor
      description={localize('com_ui_start_long_task')}
      render={
        <button
          type="button"
          aria-label={localize('com_ui_start_long_task')}
          data-testid="start-long-task-button"
          disabled={isDisabled}
          className={cn(
            'rounded-full p-1.5 text-text-secondary outline-offset-4 transition-all duration-200 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30',
          )}
          onClick={() => startLongTask(conversation)}
        >
          <ListChecks size={22} aria-hidden="true" />
        </button>
      }
    />
  );
});
