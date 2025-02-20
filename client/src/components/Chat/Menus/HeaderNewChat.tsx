import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, Constants } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { useMediaQuery, useLocalize } from '~/hooks';
import { NewChatIcon } from '~/components/svg';
import { useChatContext } from '~/Providers';

export default function HeaderNewChat() {
  const queryClient = useQueryClient();
  const { conversation, newConversation } = useChatContext();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const localize = useLocalize();
  if (isSmallScreen) {
    return null;
  }
  return (
    <button
      data-testid="wide-header-new-chat-button"
      aria-label={localize('com_ui_new_chat')}
      type="button"
      className="btn btn-neutral btn-small border-token-border-medium focus:border-black-500 dark:focus:border-white-500 relative ml-2 flex h-9 w-9 items-center justify-center whitespace-nowrap rounded-lg border md:flex"
      onClick={() => {
        queryClient.setQueryData<TMessage[]>(
          [QueryKeys.messages, conversation?.conversationId ?? Constants.NEW_CONVO],
          [],
        );
        newConversation();
      }}
    >
      <div className="flex w-full items-center justify-center gap-2">
        <NewChatIcon />
      </div>
    </button>
  );
}
