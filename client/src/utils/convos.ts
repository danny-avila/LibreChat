import {
  format,
  isToday,
  subDays,
  getYear,
  parseISO,
  startOfDay,
  startOfYear,
  isWithinInterval,
} from 'date-fns';
import { EModelEndpoint, LocalStorageKeys } from 'librechat-data-provider';
import type {
  TConversation,
  ConversationData,
  GroupedConversations,
  ConversationListResponse,
} from 'librechat-data-provider';

import { InfiniteData } from '@tanstack/react-query';

export const dateKeys = {
  today: 'com_ui_date_today',
  yesterday: 'com_ui_date_yesterday',
  previous7Days: 'com_ui_date_previous_7_days',
  previous30Days: 'com_ui_date_previous_30_days',
  january: 'com_ui_date_january',
  february: 'com_ui_date_february',
  march: 'com_ui_date_march',
  april: 'com_ui_date_april',
  may: 'com_ui_date_may',
  june: 'com_ui_date_june',
  july: 'com_ui_date_july',
  august: 'com_ui_date_august',
  september: 'com_ui_date_september',
  october: 'com_ui_date_october',
  november: 'com_ui_date_november',
  december: 'com_ui_date_december',
};

const getGroupName = (date: Date) => {
  const now = new Date(Date.now());
  if (isToday(date)) {
    return dateKeys.today;
  }
  if (isWithinInterval(date, { start: startOfDay(subDays(now, 1)), end: now })) {
    return dateKeys.yesterday;
  }
  if (isWithinInterval(date, { start: subDays(now, 7), end: now })) {
    return dateKeys.previous7Days;
  }
  if (isWithinInterval(date, { start: subDays(now, 30), end: now })) {
    return dateKeys.previous30Days;
  }
  if (isWithinInterval(date, { start: startOfYear(now), end: now })) {
    const month = format(date, 'MMMM').toLowerCase();
    return dateKeys[month];
  }
  return ' ' + getYear(date).toString();
};

const monthOrderMap = new Map([
  ['december', 11],
  ['november', 10],
  ['october', 9],
  ['september', 8],
  ['august', 7],
  ['july', 6],
  ['june', 5],
  ['may', 4],
  ['april', 3],
  ['march', 2],
  ['february', 1],
  ['january', 0],
]);

const dateKeysReverse = Object.fromEntries(
  Object.entries(dateKeys).map(([key, value]) => [value, key]),
);

const dateGroupsSet = new Set([
  dateKeys.today,
  dateKeys.yesterday,
  dateKeys.previous7Days,
  dateKeys.previous30Days,
]);

export const groupConversationsByDate = (
  conversations: Array<TConversation | null>,
): GroupedConversations => {
  if (!Array.isArray(conversations)) {
    return [];
  }

  const seenConversationIds = new Set();
  const groups = new Map();
  const now = new Date(Date.now());

  conversations.forEach((conversation) => {
    if (!conversation || seenConversationIds.has(conversation.conversationId)) {
      return;
    }
    seenConversationIds.add(conversation.conversationId);

    let date: Date;
    if (conversation.updatedAt) {
      date = parseISO(conversation.updatedAt);
    } else {
      date = now;
    }

    const groupName = getGroupName(date);
    if (!groups.has(groupName)) {
      groups.set(groupName, []);
    }
    groups.get(groupName).push(conversation);
  });

  const sortedGroups = new Map();

  // Add date groups first
  dateGroupsSet.forEach((group) => {
    if (groups.has(group)) {
      sortedGroups.set(group, groups.get(group));
    }
  });

  // Sort and add year/month groups
  const yearMonthGroups = Array.from(groups.keys())
    .filter((group) => !dateGroupsSet.has(group))
    .sort((a, b) => {
      const [yearA, yearB] = [parseInt(a.trim()), parseInt(b.trim())];
      if (yearA !== yearB) {
        return yearB - yearA;
      }

      const [monthA, monthB] = [dateKeysReverse[a], dateKeysReverse[b]];
      const bOrder = monthOrderMap.get(monthB) ?? -1;
      const aOrder = monthOrderMap.get(monthA) ?? -1;
      return bOrder - aOrder;
    });

  yearMonthGroups.forEach((group) => {
    sortedGroups.set(group, groups.get(group));
  });

  // Sort conversations within each group
  sortedGroups.forEach((conversations) => {
    conversations.sort(
      (a: TConversation, b: TConversation) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  });

  return Array.from(sortedGroups, ([key, value]) => [key, value]);
};

export const addConversation = (
  data: InfiniteData<ConversationListResponse>,
  newConversation: TConversation,
): InfiniteData<ConversationListResponse> => {
  const newPages = data.pages.map((page, idx) => {
    if (idx === 0) {
      return {
        ...page,
        conversations: [newConversation, ...page.conversations],
      };
    }
    return page;
  });

  return {
    ...data,
    pages: newPages,
  };
};

export function findPageForConversation(
  data: ConversationData,
  conversation: { conversationId: string },
) {
  let pageIndex = -1;
  let index = -1;

  data.pages.forEach((page, pIdx) => {
    const idx = page.conversations.findIndex(
      (c) => c.conversationId === conversation.conversationId,
    );
    if (idx !== -1) {
      pageIndex = pIdx;
      index = idx;
    }
  });

  return { pageIndex, index };
}

export const updateConversation = (
  data: InfiniteData<ConversationListResponse>,
  updatedConversation: TConversation,
): InfiniteData<ConversationListResponse> => {
  const newPages = data.pages.map((page) => ({
    ...page,
    conversations: page.conversations.map((convo) =>
      convo.conversationId === updatedConversation.conversationId ? updatedConversation : convo,
    ),
  }));

  return { ...data, pages: newPages };
};

export const updateConvoFields = (
  data: ConversationData,
  updatedConversation: Partial<TConversation> & Pick<TConversation, 'conversationId'>,
  keepPosition = false,
): ConversationData => {
  const newData = JSON.parse(JSON.stringify(data));
  const { pageIndex, index } = findPageForConversation(
    newData,
    updatedConversation as { conversationId: string },
  );

  if (pageIndex === -1 || index === -1) {
    return data;
  }

  const oldConversation = newData.pages[pageIndex].conversations[index];

  if (keepPosition) {
    newData.pages[pageIndex].conversations[index] = {
      ...oldConversation,
      ...updatedConversation,
    };
  } else {
    const updatedConvo = {
      ...oldConversation,
      ...updatedConversation,
      updatedAt: new Date().toISOString(),
    };
    newData.pages[pageIndex].conversations.splice(index, 1);
    newData.pages[0].conversations.unshift(updatedConvo);
  }

  return newData;
};

export const deleteConversation = (
  data: InfiniteData<ConversationListResponse>,
  conversationId: string,
): InfiniteData<ConversationListResponse> => {
  const newPages = data.pages.map((page) => ({
    ...page,
    conversations: page.conversations.filter((convo) => convo.conversationId !== conversationId),
  }));

  return { ...data, pages: newPages };
};

export const getConversationById = (
  data: ConversationData | undefined,
  conversationId: string | null,
): TConversation | undefined => {
  if (!data || !(conversationId ?? '')) {
    return undefined;
  }

  for (const page of data.pages) {
    const conversation = page.conversations.find((c) => c.conversationId === conversationId);
    if (conversation) {
      return conversation;
    }
  }
  return undefined;
};

export function storeEndpointSettings(conversation: TConversation | null) {
  if (!conversation) {
    return;
  }
  const { endpoint, model, agentOptions } = conversation;

  if (!endpoint) {
    return;
  }

  const lastModel = JSON.parse(localStorage.getItem(LocalStorageKeys.LAST_MODEL) ?? '{}');
  lastModel[endpoint] = model;

  if (endpoint === EModelEndpoint.gptPlugins) {
    lastModel.secondaryModel = agentOptions?.model ?? model ?? '';
  }

  localStorage.setItem(LocalStorageKeys.LAST_MODEL, JSON.stringify(lastModel));
}
