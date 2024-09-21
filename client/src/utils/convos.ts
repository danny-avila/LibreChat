import {
  format,
  isToday,
  subDays,
  getYear,
  parseISO,
  startOfDay,
  startOfYear,
  startOfToday,
  isWithinInterval,
} from 'date-fns';
import { EModelEndpoint, LocalStorageKeys } from 'librechat-data-provider';
import type {
  TConversation,
  ConversationData,
  GroupedConversations,
  ConversationListResponse,
} from 'librechat-data-provider';

import { addData, deleteData, updateData, findPage } from './collection';
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
  const now = new Date();
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

export const groupConversationsByDate = (
  conversations: Array<TConversation | null>,
): GroupedConversations => {
  if (!Array.isArray(conversations)) {
    return [];
  }

  const seenConversationIds = new Set();
  const groups = conversations.reduce((acc, conversation) => {
    if (!conversation) {
      return acc;
    }

    if (seenConversationIds.has(conversation.conversationId)) {
      return acc;
    }
    seenConversationIds.add(conversation.conversationId);

    const date = conversation.updatedAt ? parseISO(conversation.updatedAt) : startOfToday();
    const groupName = getGroupName(date);
    if (acc[groupName] === undefined || acc[groupName] === null) {
      acc[groupName] = [];
    }
    acc[groupName].push(conversation);
    return acc;
  }, {});

  const sortedGroups = {};
  const dateGroups = [
    dateKeys.today,
    dateKeys.yesterday,
    dateKeys.previous7Days,
    dateKeys.previous30Days,
  ];
  dateGroups.forEach((group) => {
    if (groups[group] != null) {
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

  return Object.entries(sortedGroups);
};

export const addConversation = (
  data: InfiniteData<ConversationListResponse>,
  newConversation: TConversation,
): ConversationData => {
  return addData<ConversationListResponse, TConversation>(
    data,
    'conversations',
    newConversation,
    (page) =>
      page.conversations.findIndex((c) => c.conversationId === newConversation.conversationId),
  );
};

export function findPageForConversation(
  data: ConversationData,
  conversation: TConversation | { conversationId: string },
) {
  return findPage<ConversationListResponse>(data, (page) =>
    page.conversations.findIndex((c) => c.conversationId === conversation.conversationId),
  );
}

export const updateConversation = (
  data: InfiniteData<ConversationListResponse>,
  newConversation: TConversation,
): ConversationData => {
  return updateData<ConversationListResponse, TConversation>(
    data,
    'conversations',
    newConversation,
    (page) =>
      page.conversations.findIndex((c) => c.conversationId === newConversation.conversationId),
  );
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
  if (pageIndex !== -1 && index !== -1) {
    const oldConversation = newData.pages[pageIndex].conversations[index] as TConversation;

    /**
     * Do not change the position of the conversation if the tags are updated.
     */
    if (keepPosition) {
      const updatedConvo = {
        ...oldConversation,
        ...updatedConversation,
      };
      newData.pages[pageIndex].conversations[index] = updatedConvo;
    } else {
      const updatedConvo = {
        ...oldConversation,
        ...updatedConversation,
        updatedAt: new Date().toISOString(),
      };
      newData.pages[pageIndex].conversations.splice(index, 1);
      newData.pages[0].conversations.unshift(updatedConvo);
    }
  }

  return newData;
};

export const deleteConversation = (
  data: ConversationData,
  conversationId: string,
): ConversationData => {
  return deleteData<ConversationListResponse, ConversationData>(data, 'conversations', (page) =>
    page.conversations.findIndex((c) => c.conversationId === conversationId),
  );
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
  const { endpoint, model, agentOptions, jailbreak, toneStyle } = conversation;

  if (!endpoint) {
    return;
  }

  if (endpoint === EModelEndpoint.bingAI) {
    const settings = { jailbreak, toneStyle };
    localStorage.setItem(LocalStorageKeys.LAST_BING, JSON.stringify(settings));
    return;
  }

  const lastModel = JSON.parse(localStorage.getItem(LocalStorageKeys.LAST_MODEL) ?? '{}');
  lastModel[endpoint] = model;

  if (endpoint === EModelEndpoint.gptPlugins) {
    lastModel.secondaryModel = agentOptions?.model ?? model ?? '';
  }

  localStorage.setItem(LocalStorageKeys.LAST_MODEL, JSON.stringify(lastModel));
}
