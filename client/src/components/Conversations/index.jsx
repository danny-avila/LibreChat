import React from 'react';
import Conversation from './Conversation';

export default function Conversations({ conversations, moveToTop }) {
  const sortedConversations = conversations.sort((a, b) => {
    const dateA = new Date(a.updatedAt);
    const dateB = new Date(b.updatedAt);
    return dateB - dateA;
  });

  const groupByDate = (conversations) => {
    const groups = {};
    conversations.forEach((convo) => {
      const date = new Date(convo.updatedAt);
      const today = new Date();
      const diffTime = Math.abs(today - date);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      let groupTitle = '';
      if (diffDays === 1) {
        groupTitle = 'Yesterday';
      } else if (diffDays <= 7) {
        groupTitle = `${diffDays} days ago`;
      } else if (diffDays <= 30) {
        groupTitle = `${Math.floor(diffDays / 7)} weeks ago`;
      } else if (diffDays <= 365) {
        groupTitle = `${Math.floor(diffDays / 30)} months ago`;
      } else if (diffDays <= 365 * 2) {
        groupTitle = `Last year`;
      } else if (diffDays <= 365 * 3) {
        groupTitle = `2 years ago`;
      } else if (diffDays <= 365 * 4) {
        groupTitle = `3 years ago`;
      } else {
        groupTitle = `${Math.floor(diffDays / 365)} years ago`;
      }
      if (!groups[groupTitle]) {
        groups[groupTitle] = [];
      }
      groups[groupTitle].push(convo);
    });
    return groups;
  };

  const groupedConversations = groupByDate(sortedConversations);

  return (
    <>
      {Object.entries(groupedConversations).map(([groupTitle, groupConversations]) => (
        <div key={groupTitle} className="relative">
          <div className="sticky top-0 z-[16]">
            <h2 className="h-9 overflow-hidden text-ellipsis break-all bg-gray-900 px-3 pb-2 pt-3 text-xs font-medium text-gray-500">
              {groupTitle}
            </h2>
          </div>
          {groupConversations.map((convo) => (
            <Conversation key={convo.conversationId} conversation={convo} retainView={moveToTop} />
          ))}
        </div>
      ))}
    </>
  );
}
