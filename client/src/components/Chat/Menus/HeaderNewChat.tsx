import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, Constants } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { useMediaQuery, useLocalize } from '~/hooks';
import { Button, NewChatIcon } from '~/components';
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
    <Button
      size="icon"
      variant="outline"
      data-testid="wide-header-new-chat-button"
      aria-label={localize('com_ui_new_chat')}
      className="rounded-xl border border-border-light bg-surface-secondary p-2 hover:bg-surface-hover"
      onClick={() => {
        queryClient.setQueryData<TMessage[]>(
          [QueryKeys.messages, conversation?.conversationId ?? Constants.NEW_CONVO],
          [],
        );
        newConversation();
      }}
    >
      <NewChatIcon />
    </Button>
  );
}
