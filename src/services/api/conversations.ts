import { Conversation } from '~/types/conversation';
import { axios } from './setup';

export const createConversation = async () => {
  return (await axios.post<{ conversation: Conversation }>(`conversations`)).data.conversation;
};

export const getCurrentConversation = async () => {
  return (await axios.get<{ conversation: Conversation }>('conversations')).data.conversation;
};

export const getAllConversations = async () => {
  return (await axios.get<{ conversations: Conversation[] }>(`conversations/all`)).data
    .conversations;
};

export const getConversation = async (conversationId: string) => {
  return (await axios.get<{ conversation: Conversation }>(`conversations/${conversationId}`)).data
    .conversation;
};
