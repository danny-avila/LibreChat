import React from 'react';
import Conversation from './Conversation';

export default function Conversations({ conversations, conversationId, showMore }) {
  const clickHandler = async (e) => {
    e.preventDefault();
    await showMore();
  };

  return (
    <>
      {conversations &&
        conversations.length > 0 &&
        conversations.map((convo) => {
          const bingData = convo.conversationSignature
            ? {
                jailbreakConversationId: convo.jailbreakConversationId,
                conversationSignature: convo.conversationSignature,
                clientId: convo.clientId,
                invocationId: convo.invocationId
              }
            : null;

          return (
            <Conversation
              key={convo.conversationId}
              id={convo.conversationId}
              parentMessageId={convo.parentMessageId}
              title={convo.title}
              conversationId={conversationId}
              chatGptLabel={convo.chatGptLabel}
              promptPrefix={convo.promptPrefix}
              bingData={bingData}
            />
          );
        })}
      {conversations && conversations.length >= 12 && conversations.length % 12 === 0 && (
        <button
          onClick={clickHandler}
          className="btn btn-dark btn-small m-auto mb-2 flex justify-center gap-2"
        >
          Show more
        </button>
      )}
    </>
  );
}
