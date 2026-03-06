import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { useRecoilValue } from 'recoil';
import { TooltipAnchor, Button, NewChatIcon } from '@librechat/client';
import { useNewConvo } from '~/hooks';
import { clearMessagesCache } from '~/utils';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function HeaderNewChat() {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo();
  const conversation = useRecoilValue(store.conversationByIndex(0));

  const clickHandler: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
      window.open('/c/new', '_blank');
      return;
    }
    clearMessagesCache(queryClient, conversation?.conversationId);
    queryClient.invalidateQueries([QueryKeys.messages]);
    newConversation();
  };

  return (
    <TooltipAnchor
      description={localize('com_ui_new_chat')}
      render={
        <Button
          size="icon"
          variant="outline"
          data-testid="wide-header-new-chat-button"
          aria-label={localize('com_ui_new_chat')}
          className="rounded-xl bg-presentation duration-0 hover:bg-surface-active-alt max-md:hidden"
          onClick={clickHandler}
        >
          <NewChatIcon />
        </Button>
      }
    />
  );
}
