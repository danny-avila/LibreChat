import { useMemo, memo } from 'react';
import { parseISO, isToday } from 'date-fns';
import { TConversation } from 'librechat-data-provider';
import { groupConversationsByDate } from '~/utils';
import { useLocalize } from '~/hooks';
import Convo from './Convo';

const Conversations = ({
  conversations,
  moveToTop,
  toggleNav,
}: {
  conversations: TConversation[];
  moveToTop: () => void;
  toggleNav: () => void;
}) => {
  const localize = useLocalize();
  const groupedConversations = useMemo(
    () => groupConversationsByDate(conversations),
    [conversations],
  );
  const firstTodayConvoId = useMemo(
    () =>
      conversations.find((convo) => convo && isToday(parseISO(convo.updatedAt)))?.conversationId,
    [conversations],
  );

  return (
    <div className="text-token-text-primary mt-5 flex flex-col gap-2 pb-2 text-sm">
      <div className="empty:hidden">
        {groupedConversations.map(([groupName, convos]) => (
          <div className="relative mt-5 first:mt-0 last:mb-5 empty:mt-0 empty:hidden">
            <div className="bg-gray-50 dark:bg-gray-750 sticky top-0 z-20" key={groupName}>
              <span className="flex h-9 items-center">
                <h3 className="text-token-text-secondary overflow-hidden text-ellipsis break-all px-2 pb-2 pt-3 text-xs font-medium">
                  {localize(groupName) || groupName}
                </h3>
              </span>
            </div>
            <ol>
              {convos.map((convo, i) => (
                <li key={`${groupName}-${convo.conversationId}-${i}`}>
                  <Convo
                    isLatestConvo={convo.conversationId === firstTodayConvoId}
                    conversation={convo}
                    retainView={moveToTop}
                    toggleNav={toggleNav}
                  />
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
};

export default memo(Conversations);
