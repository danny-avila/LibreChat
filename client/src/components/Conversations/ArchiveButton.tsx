import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui';
import type { MouseEvent, FocusEvent, KeyboardEvent } from 'react';
import { useParams } from 'react-router-dom';

import { useArchiveConversationMutation } from '~/data-provider';

import { useConversations, useLocalize, useNewConvo } from '~/hooks';
import { useToastContext } from '~/Providers';
import { NotificationSeverity } from '~/common';

type ArchiveButtonProps = {
  conversationId: string;
  retainView: () => void;
  shouldArchive: boolean;
  icon: React.ReactNode;
  twcss?: string;
};
export default function ArchiveButton({
  conversationId,
  retainView,
  shouldArchive,
  icon,
  twcss = undefined,
}: ArchiveButtonProps) {
  const localize = useLocalize();
  const { newConversation } = useNewConvo();
  const { showToast } = useToastContext();
  const { refreshConversations } = useConversations();
  const { conversationId: currentConvoId } = useParams();

  const archiveConvoMutation = useArchiveConversationMutation(conversationId);

  const label = shouldArchive ? 'archive' : 'unarchive';
  const archiveHandler = (
    e:
      | MouseEvent<HTMLButtonElement>
      | FocusEvent<HTMLInputElement>
      | KeyboardEvent<HTMLInputElement>,
  ) => {
    e.preventDefault();
    archiveConvoMutation.mutate(
      { conversationId, isArchived: shouldArchive },
      {
        onSuccess: () => {
          if (currentConvoId === conversationId) {
            newConversation();
          }
          refreshConversations();
          retainView();
        },
        onError: () => {
          showToast({
            message: localize(`com_ui_${label}_error`),
            severity: NotificationSeverity.ERROR,
            showIcon: true,
          });
        },
      },
    );
  };
  const classProp: { className?: string } = {
    className: 'p-1 hover:text-black dark:hover:text-white',
  };
  if (twcss) {
    classProp.className = twcss;
  }
  return (
    <button type="button" className={classProp.className} onClick={archiveHandler}>
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>{icon}</span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={0}>
            {localize(`com_ui_${label}`)}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </button>
  );
}
