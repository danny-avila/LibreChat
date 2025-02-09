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
  conversations: Array<TConversation | null>;
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
      conversations.find((convo) => convo && convo.updatedAt && isToday(parseISO(convo.updatedAt)))
        ?.conversationId,
    [conversations],
  );

  return (
    <div className="text-token-text-primary flex flex-col gap-2 pb-2 text-sm">
      <div>
        <span>
          {groupedConversations.map(([groupName, convos]) => (
            <div key={groupName}>
              <div
                className="text-text-secondary"
                style={{
                  fontSize: '0.7rem',
                  marginTop: '20px',
                  marginBottom: '5px',
                  paddingLeft: '10px',
                }}
              >
                {localize(groupName) || groupName}
              </div>
              {convos.map((convo, i) => (
                <Convo
                  key={`${groupName}-${convo.conversationId}-${i}`}
                  isLatestConvo={convo.conversationId === firstTodayConvoId}
                  conversation={convo}
                  retainView={moveToTop}
                  toggleNav={toggleNav}
                />
              ))}
              <div
                style={{
                  marginTop: '5px',
                  marginBottom: '5px',
                }}
              />
            </div>
          ))}
        </span>
      </div>
    </div>
  );
};

export default memo(Conversations);
