import React, { useState } from 'react';
import Conversation from './Conversation';

export default function Conversations({ conversations, conversationId }) {
  // const currentRef = useRef(null);

  // const scrollToTop = () => {
  //   currentRef.current?.scrollIntoView({ behavior: 'smooth' });
  // };

  // // this useEffect triggers the following warning in the Messages component (but not here):
  // // Warning: Internal React error: Expected static flag was missing.
  // useEffect(() => {
  //   scrollToTop();
  // }, [conversationId]);

  return (
    <>
      {/* <div ref={currentRef} /> */}
      {conversations &&
        conversations.length > 0 &&
        conversations.map((convo, i) => {
          const bingData = convo.conversationSignature
            ? {
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
              bingData={bingData}
            />
          );
        })}
      {conversations && conversations.length >= 12 && (
        <button className="btn btn-dark btn-small m-auto mb-2 flex justify-center gap-2">
          Show more
        </button>
      )}
    </>
  );
}
