import { Link } from 'lucide-react';
import type { TMessage } from 'librechat-data-provider';
import { useLocalize, useNavigateToConvo } from '~/hooks';
import { useSearchContext } from '~/Providers';
import { getConversationById } from '~/utils';

export default function SearchButtons({ message }: { message: TMessage }) {
  const localize = useLocalize();
  const { searchQueryRes } = useSearchContext();
  const { navigateWithLastTools } = useNavigateToConvo();

  if (!message.conversationId) {
    return null;
  }

  const clickHandler = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();

    const conversation = getConversationById(searchQueryRes?.data, message.conversationId);
    if (!conversation) {
      return;
    }

    document.title = message.title ?? '';
    navigateWithLastTools(conversation);
  };

  return (
    <div className="visible mt-0 flex items-center justify-center gap-1 self-end text-gray-400 lg:justify-start">
      <a
        className="ml-0 flex cursor-pointer items-center gap-1.5 rounded-md p-1 text-xs hover:text-gray-900 hover:underline dark:text-gray-400/70 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400"
        onClick={clickHandler}
        title={localize('com_ui_go_to_conversation')}
      >
        <Link className="icon-sm" />
        {message.title}
      </a>
    </div>
  );
}
