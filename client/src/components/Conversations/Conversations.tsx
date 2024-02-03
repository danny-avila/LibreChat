import { parseISO, isToday } from 'date-fns';
import { useLocation } from 'react-router-dom';
import { TConversation } from 'librechat-data-provider';
import { groupConversationsByDate } from '~/utils';
import Conversation from './Conversation';
import Convo from './Convo';

export default function Conversations({
  conversations,
  moveToTop,
  toggleNav,
}: {
  conversations: TConversation[];
  moveToTop: () => void;
  toggleNav: () => void;
}) {
  const location = useLocation();
  const { pathname } = location;
  const ConvoItem = pathname.includes('chat') ? Conversation : Convo;
  const groupedConversations = groupConversationsByDate(conversations);
  const firstTodayConvoId = conversations.find((convo) =>
    isToday(parseISO(convo.updatedAt)),
  )?.conversationId;

  return (
    <div className="flex-1 flex-col overflow-y-auto">
      {Object.entries(groupedConversations).map(([groupName, convos]) => (
        <div key={groupName}>
          <div
            style={{
              color: '#aaa',
              fontSize: '0.7rem',
              marginTop: '20px',
              marginBottom: '5px',
              paddingLeft: '10px',
            }}
          >
            {groupName}
          </div>
          {convos.map((convo, i) => (
            <ConvoItem
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
          ></div>
        </div>
      ))}
    </div>
  );
}
