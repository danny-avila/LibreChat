import { Conversation } from '~/types/conversation';
import { axios } from './setup';
import { User } from '~/types/user';
import { buildMessagesFromEvents } from '~/utils/buildTree';

export const createConversation = async () => {
  return (await axios.post<{ conversation: Conversation }>(`conversations`)).data.conversation;
};

export const getAllUserConversations = async (userId: string) => {
  return (await axios.get<{ conversations: Conversation[] }>(`conversations/user/${userId}`)).data
    .conversations;
};

export const getConversationEvents = async (conversationId: string) => {
  if (conversationId === 'new') return [];

  return (await axios.get<{ conversation: Conversation }>(`conversations/${conversationId}/events`))
    .data;
};

export const getConversationMessages = async (conversationId: string, user: User) => {
  if (conversationId === 'new') return [];

  const eventsData = (
    await axios.get<{ conversation: Conversation }>(`conversations/${conversationId}/events`)
  ).data;

  return buildMessagesFromEvents({ events: eventsData.events, user });
};
