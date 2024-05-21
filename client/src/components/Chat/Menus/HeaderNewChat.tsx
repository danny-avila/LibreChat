import { NewChatIcon } from '~/components/svg';
import { useChatContext } from '~/Providers';
import { useMediaQuery } from '~/hooks';

export default function HeaderNewChat() {
  const { newConversation } = useChatContext();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  if (isSmallScreen) {
    return null;
  }
  return (
    <button
      data-testid="wide-header-new-chat-button"
      type="button"
      className="btn btn-neutral btn-small border-token-border-medium relative ml-2 flex hidden h-9 w-9 items-center justify-center whitespace-nowrap rounded-lg rounded-lg border focus:ring-0 focus:ring-offset-0 md:flex"
      onClick={() => newConversation()}
    >
      <div className="flex w-full items-center justify-center gap-2">
        <NewChatIcon />
      </div>
    </button>
  );
}
