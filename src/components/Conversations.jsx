import React from 'react';
import Conversation from './Conversation';

export default function Conversations({ conversations, convoHandler }) {
  return (
    <div className="-mr-2 flex-1 flex-col overflow-y-auto border-b border-white/20">
      <div className="flex flex-col gap-2 text-sm text-gray-100">
        {conversations &&
          conversations.map((convo, i) => (
            <Conversation
              key={convo.conversationId}
              title={convo.title}
              onClick={() => convoHandler(convo.conversationId)}
            />
          ))}
        {conversations && conversations.length >= 12 && (
          <button className="btn btn-dark btn-small m-auto mb-2 flex justify-center gap-2">
            Show more
          </button>
        )}
      </div>
    </div>
  );
}
