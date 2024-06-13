import { atom, selector, atomFamily } from 'recoil';
import { TConversation, TMessagesAtom, TMessage } from 'librechat-data-provider';
import { buildTree } from '~/utils';

const conversation = atom<TConversation | null>({
  key: 'conversation',
  default: null,
});

// current messages of the conversation, must be an array
// sample structure
// [{text, sender, messageId, parentMessageId, isCreatedByUser}]
const messages = atom<TMessagesAtom>({
  key: 'messages',
  default: [],
});

const rooms = atom<TConversation[]>({
  key: 'rooms',
  default: [],
});

const messagesTree = selector({
  key: 'messagesTree',
  get: ({ get }) => {
    return buildTree({ messages: get(messages) });
  },
});

const latestMessage = atom<TMessage | null>({
  key: 'latestMessage',
  default: null,
});

const convoType = atom<'c' | 'r'>({
  key: 'convoType',
  default: 'c',
});

const roomSearchIndex = atom<'user' | 'all'>({
  key: 'roomSearchIndex',
  default: 'user',
});

export type EndpointKeyTypes = 'google' | 'openai' | 'anthropic' | 'sdimage' | null;
export type SortKeyTypes = 'participants-asc' | 'participants-desc' | 'date-asc' | 'date-desc' | 'none';
export interface SearchOptions {
  endpoint: EndpointKeyTypes;
  sort: SortKeyTypes;
}

const searchOptions = atom<SearchOptions>({
  key: 'searchOptions',
  default: {
    endpoint: null,
    sort: 'none',
  },
});

const messagesSiblingIdxFamily = atomFamily<number, string | null | undefined>({
  key: 'messagesSiblingIdx',
  default: 0,
});

export default {
  messages,
  conversation,
  messagesTree,
  latestMessage,
  messagesSiblingIdxFamily,
  convoType,
  rooms,
  roomSearchIndex,
  searchOptions,
};
