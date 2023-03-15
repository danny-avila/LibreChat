import React from 'react';
import Conversation from './Conversation';

export default function Conversations({ conversations, conversationId, pageNumber, pages, nextPage, previousPage, moveToTop }) {
  const clickHandler = (func) => async (e) => {
    e.preventDefault();
    await func();
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
                parentMessageId: convo.parentMessageId || null,
                clientId: convo.clientId,
                invocationId: convo.invocationId
              }
            : null;

          return (
            <Conversation
              key={convo.conversationId}
              id={convo.conversationId}
              model={convo.model}
              parentMessageId={convo.parentMessageId}
              title={convo.title}
              conversationId={conversationId}
              chatGptLabel={convo.chatGptLabel}
              promptPrefix={convo.promptPrefix}
              bingData={bingData}
              retainView={moveToTop}
            />
          );
        })}
        <div className="m-auto mt-4 mb-2 flex justify-center items-center gap-2">
          <button
            onClick={clickHandler(previousPage)}
            className={"flex btn btn-small transition bg-transition dark:text-white disabled:text-gray-300 dark:disabled:text-gray-400 m-auto gap-2 hover:bg-gray-800" + (pageNumber<=1?" hidden-visibility":"")}
            disabled={pageNumber<=1}
          >
            &lt;&lt;
          </button>
          <span className="flex-none text-gray-400">
            {pageNumber} / {pages}
          </span>
          <button
            onClick={clickHandler(nextPage)}
            className={"flex btn btn-small transition bg-transition dark:text-white disabled:text-gray-300 dark:disabled:text-gray-400 m-auto gap-2 hover:bg-gray-800" + (pageNumber>=pages?" hidden-visibility":"")}
            disabled={pageNumber>=pages}
          >
            &gt;&gt;
          </button>
        </div>
    </>
  );
}
