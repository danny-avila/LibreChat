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
      className="h-10 rounded-lg px-2.5 text-token-text-secondary focus-visible:outline-0 hover:bg-gray-100 dark:hover:bg-gray-700 focus-visible:bg-gray-100 dark:focus-visible:bg-gray-700"
      onClick={() => newConversation()}
    >
      <div className="flex w-full items-center justify-center gap-2">
        <NewChatIcon />
      </div>
    </button>
  );
}
