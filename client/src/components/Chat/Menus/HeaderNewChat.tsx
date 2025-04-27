import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, Constants } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { TooltipAnchor, Button } from '~/components/ui';
import { NewChatIcon } from '~/components/svg';
import { useChatContext } from '~/Providers';
import { useLocalize } from '~/hooks';

export default function HeaderNewChat() {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { conversation, newConversation } = useChatContext();

  return (
    <TooltipAnchor
      description={localize('com_ui_new_chat')}
      render={
        <Button
          size="icon"
          variant="outline"
          data-testid="wide-header-new-chat-button"
          aria-label={localize('com_ui_new_chat')}
          className="rounded-xl border border-border-light bg-surface-secondary p-2 hover:bg-surface-hover max-md:hidden"
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
      }
    />
  );
}
