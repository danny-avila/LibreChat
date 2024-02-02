import { parseISO, isToday, isWithinInterval, subDays, getYear } from 'date-fns';
import type { TConversation } from 'librechat-data-provider';

const getGroupName = (date: Date) => {
  const now = new Date();
  if (isToday(date)) {
    return 'Today';
  }
  if (isWithinInterval(date, { start: subDays(now, 7), end: now })) {
    return 'Last 7 days';
  }
  if (isWithinInterval(date, { start: subDays(now, 30), end: now })) {
    return 'Last 30 days';
  }
  return ' ' + getYear(date).toString();
};

export const groupConversationsByDate = (
  conversations: TConversation[],
): {
  [key: string]: TConversation[];
} => {
  if (!Array.isArray(conversations)) {
    return {};
  }
  const groups = conversations.reduce((acc, conversation) => {
    const date = parseISO(conversation.updatedAt);
    const groupName = getGroupName(date);
    if (!acc[groupName]) {
      acc[groupName] = [];
    }
    acc[groupName].push(conversation);
    return acc;
  }, {});

  const sortedGroups = {};
  const dateGroups = ['Today', 'Last 7 days', 'Last 30 days'];
  dateGroups.forEach((group) => {
    if (groups[group]) {
      sortedGroups[group] = groups[group];
    }
  });

  Object.keys(groups)
    .filter((group) => !dateGroups.includes(group))
    .sort()
    .reverse()
    .forEach((year) => {
      sortedGroups[year] = groups[year];
    });

  return sortedGroups;
};
