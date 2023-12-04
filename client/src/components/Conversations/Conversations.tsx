import Convo from './Convo';
import Conversation from './Conversation';
import { useLocation } from 'react-router-dom';
import { TConversation } from 'librechat-data-provider';

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

  return (
    <>
      {conversations &&
        conversations.length > 0 &&
        conversations.map((convo: TConversation, i) => {
          return (
            <ConvoItem
              key={convo.conversationId}
              conversation={convo}
              retainView={moveToTop}
              toggleNav={toggleNav}
              i={i}
            />
          );
        })}
    </>
  );
}
