import Conversation from './Conversation';
import { TConversation } from 'librechat-data-provider';

export default function Conversations({
  conversations,
  moveToTop,
}: {
  conversations: TConversation[];
  moveToTop: () => void;
}) {
  return (
    <>
      {conversations &&
        conversations.length > 0 &&
        conversations.map((convo: TConversation) => {
          return (
            <Conversation key={convo.conversationId} conversation={convo} retainView={moveToTop} />
          );
        })}
    </>
  );
}
