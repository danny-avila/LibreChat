import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { TooltipAnchor } from '~/components/ui';
import { useLocalize, useNewConvo } from '~/hooks';
import { PlusCircle } from 'lucide-react';
import store from '~/store';
import type { TMessage } from 'librechat-data-provider';
import { Constants, QueryKeys } from 'librechat-data-provider';

function CreateNewChat() {
  const queryClient = useQueryClient();
  /** Note: this component needs an explicit index passed if using more than one */
  const { newConversation: newConvo } = useNewConvo(0);
  const navigate = useNavigate();
  const localize = useLocalize();

  const { conversation } = store.useCreateConversationAtom(0);

  const clickHandler = () => {
      queryClient.setQueryData<TMessage[]>(
        [QueryKeys.messages, conversation?.conversationId ?? Constants.NEW_CONVO],
        [],
      );
      newConvo();
      navigate('/c/new');
  };

  return (
    <TooltipAnchor
      id="add-multi-conversation-button"
      aria-label={localize('com_ui_new_chat')}
      description={localize('com_ui_new_chat')}
      tabIndex={0}
      role="button"
      onClick={clickHandler}
      data-testid="parameters-button"
      className="inline-flex size-10 flex-shrink-0 items-center justify-center rounded-lg border border-border-light bg-transparent text-text-primary transition-all ease-in-out hover:bg-surface-tertiary hover:dark:bg-darkbeige800 disabled:pointer-events-none disabled:opacity-50 radix-state-open:bg-surface-tertiary"
    >
      <PlusCircle size={16} aria-label="Plus Icon" />
    </TooltipAnchor>
  );
}

export default CreateNewChat;
