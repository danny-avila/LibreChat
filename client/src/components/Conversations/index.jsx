import React from 'react';
import { formatDistanceToNow } from 'date-fns';
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
      const diffDays = Math.ceil((today - date) / (1000 * 60 * 60 * 24));
      let groupTitle = '';
      if (diffDays === 0) {
        groupTitle = 'Today';
      } else {
        groupTitle = formatDistanceToNow(date, { addSuffix: true });
      }
      if (!groups[groupTitle]) {
        groups[groupTitle] = [];
      }
      // Check if conversation already exists in the group
      const existingConvo = groups[groupTitle].find(
        (c) => c.conversationId === convo.conversationId
      );
      if (!existingConvo) {
        groups[groupTitle].push(convo);
      }
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
