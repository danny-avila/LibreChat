/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import NewJerseyIcon from '~/nj/svgs/NewJerseyIcon';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import { logEvent } from '~/nj/analytics/logEvent';
import { clearMessagesCache } from '~/utils';
import store from '~/store';
import { useNewConvo } from '~/hooks';

/**
 * Component that displays the New Jersey logo next to AI assistant text.
 */
export default function NewJerseyLogo({ index = 0 }: { index: number }) {
  const { newConversation: newConvo } = useNewConvo(index);
  const queryClient = useQueryClient();
  const { conversation } = store.useCreateConversationAtom(index);

  // Clicking the logo takes us back to the landing page (aka a new conversation)
  const onClick = async () => {
    clearMessagesCache(queryClient, conversation?.conversationId);
    await queryClient.invalidateQueries([QueryKeys.messages]);
    logEvent('click_clear_chat');
    newConvo();
  };

  return (
    <div role="button" className="flex items-center gap-3 p-2" onClick={onClick}>
      <NewJerseyIcon height={23} />
      <h1 className="font-semibold tracking-tight text-jersey-blue">NJ AI Assistant</h1>
    </div>
  );
}
