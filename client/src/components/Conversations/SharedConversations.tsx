import { memo, useMemo, useCallback } from 'react';
import { ChevronDown, Share2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Spinner } from '@librechat/client';
import { useGetSharedConversationsQuery } from 'librechat-data-provider/react-query';
import type { SharedConversationListItem } from 'librechat-data-provider';
import { useLocalize, useLocalStorage } from '~/hooks';
import { cn } from '~/utils';

interface SharedConversationsProps {
  toggleNav: () => void;
}

interface SharedConvoItemProps {
  convo: SharedConversationListItem;
  isActive: boolean;
  onClick: () => void;
}

const SharedConvoItem = memo(({ convo, isActive, onClick }: SharedConvoItemProps) => {
  const localize = useLocalize();

  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors',
        isActive
          ? 'bg-surface-active text-text-primary'
          : 'text-text-secondary hover:bg-surface-hover',
      )}
    >
      <Share2 className="size-4 shrink-0 text-green-500" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{convo.title || 'Untitled'}</span>
        {convo.ownerName && (
          <span className="truncate text-xs text-text-tertiary">
            {localize('com_ui_shared_by', { name: convo.ownerName })}
          </span>
        )}
      </div>
    </button>
  );
});

SharedConvoItem.displayName = 'SharedConvoItem';

const SharedConversations = memo(({ toggleNav }: SharedConversationsProps) => {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const [isExpanded, setIsExpanded] = useLocalStorage('sharedConvosExpanded', true);

  const { data, isLoading } = useGetSharedConversationsQuery(
    { pageSize: 25 },
    { staleTime: 60000 },
  );

  const sharedConversations = useMemo(() => data?.shares || [], [data?.shares]);

  const handleConvoClick = useCallback(
    (convoId: string) => {
      navigate(`/c/${convoId}?shared=true`);
      toggleNav();
    },
    [navigate, toggleNav],
  );

  if (isLoading) {
    return (
      <div className="px-2 py-2">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Spinner className="size-3" />
          <span>{localize('com_ui_loading')}</span>
        </div>
      </div>
    );
  }

  if (sharedConversations.length === 0) {
    return null;
  }

  return (
    <div className="px-1">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="group flex w-full items-center justify-between px-1 py-2 text-xs font-bold text-text-secondary"
        type="button"
      >
        <div className="flex items-center gap-1.5">
          <Share2 className="size-3 text-green-500" />
          <span className="select-none">{localize('com_ui_shared_conversations')}</span>
          <span className="text-text-tertiary">({sharedConversations.length})</span>
        </div>
        <ChevronDown
          className={cn(
            'h-3 w-3 transition-transform duration-200',
            isExpanded ? 'rotate-180' : '',
          )}
        />
      </button>
      {isExpanded && (
        <div className="mt-1 space-y-0.5">
          {sharedConversations.map((convo) => (
            <SharedConvoItem
              key={convo.conversationId}
              convo={convo}
              isActive={conversationId === convo.conversationId}
              onClick={() => handleConvoClick(convo.conversationId)}
            />
          ))}
        </div>
      )}
    </div>
  );
});

SharedConversations.displayName = 'SharedConversations';

export default SharedConversations;
