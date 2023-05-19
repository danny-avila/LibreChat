import Conversation from './Conversation';

export default function Conversations({ conversations, moveToTop }) {
  return (
    <>
      {conversations &&
        conversations.length > 0 &&
        conversations.map((convo) => {
          return (
            <Conversation key={convo.conversationId} conversation={convo} retainView={moveToTop} />
          );
        })}
    </>
  );
}
