import { useState } from 'react';
import { Link } from 'lucide-react';
import type { TMessage } from 'librechat-data-provider';
import { useLocalize, useNavigateToConvo } from '~/hooks';
import { useGetConvoIdQuery } from '~/data-provider';
import { Spinner } from '~/components';

export default function SearchButtons({ message }: { message: TMessage }) {
  const localize = useLocalize();
  const { navigateWithLastTools } = useNavigateToConvo();
  const conversationId = message.conversationId ?? '';
  const [enabled, setEnabled] = useState(false);

  const {
    data: conversation,
    isFetching: isLoading,
    refetch,
  } = useGetConvoIdQuery(conversationId, { enabled });

  const clickHandler = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!conversationId) {
      return;
    }

    if (!enabled) {
      setEnabled(true);
    } else {
      await refetch();
    }

    document.title = message.title ?? '';
    navigateWithLastTools(conversation, true, true);
  };

  if (!conversationId) {
    return null;
  }

  return (
    <div className="visible mt-0 flex items-center justify-center gap-1 self-end text-text-secondary lg:justify-start">
      <button
        className="ml-0 flex cursor-pointer items-center gap-1.5 rounded-md p-1 text-xs hover:text-text-primary hover:underline"
        onClick={clickHandler}
        title={localize('com_ui_go_to_conversation')}
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Spinner className="size-4" />
            <span className="animate-pulse text-text-primary">{localize('com_ui_loading')}</span>
          </>
        ) : (
          <>
            <Link className="icon-sm" />
            {message.title}
          </>
        )}
      </button>
    </div>
  );
}
