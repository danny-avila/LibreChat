import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { MouseEvent, FocusEvent, KeyboardEvent } from 'react';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui';
import { useConversations, useLocalize, useNewConvo } from '~/hooks';
import { useArchiveConversationMutation } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';

type ArchiveButtonProps = {
  children?: React.ReactNode;
  conversationId: string;
  retainView: () => void;
  shouldArchive: boolean;
  icon?: React.ReactNode;
  className?: string;
};

export function useArchiveHandler(
  conversationId: string,
  shouldArchive: boolean,
  retainView: () => void,
) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { showToast } = useToastContext();
  const { newConversation } = useNewConvo();
  const { refreshConversations } = useConversations();
  const { conversationId: currentConvoId } = useParams();

  const archiveConvoMutation = useArchiveConversationMutation(conversationId);

  return async (e?: MouseEvent | FocusEvent | KeyboardEvent) => {
    if (e) {
      e.preventDefault();
    }
    const label = shouldArchive ? 'archive' : 'unarchive';
    archiveConvoMutation.mutate(
      { conversationId, isArchived: shouldArchive },
      {
        onSuccess: () => {
          if (currentConvoId === conversationId || currentConvoId === 'new') {
            newConversation();
            navigate('/c/new', { replace: true });
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
}

export default function ArchiveButton({
  conversationId,
  retainView,
  shouldArchive,
  icon,
  className = '',
}: ArchiveButtonProps) {
  const localize = useLocalize();
  const archiveHandler = useArchiveHandler(conversationId, shouldArchive, retainView);

  return (
    <button type="button" className={className} onClick={archiveHandler}>
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="h-5 w-5">{icon}</span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={0}>
            {localize(`com_ui_${shouldArchive ? 'archive' : 'unarchive'}`)}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </button>
  );
}

export { useArchiveHandler as archiveHandler };
