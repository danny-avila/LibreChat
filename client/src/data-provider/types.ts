export type TMessage = {
  messageId: string;
  conversationId: string;
  conversationSignature: string | null;
  clientId: string;
  invocationId: string;
  parentMessageId: string;
  sender: string;
  text: string;
  isCreatedByUser: boolean;
  error: boolean;
  createdAt: string;
  updatedAt: string;
  searchResult: string[];
  submitting: boolean;
  children?: any[] | undefined;
  bgColor?: string;
  model?: string;
  cancelled?: boolean;
};

export type TConversation = {
  conversationId: string;
  parentMessageId: string;
  title: string;
  jailbreakConversationId: string | null;
  conversationSignature: string | null;
  clientId: string;
  invocationId: string | null;
  chatGptLabel: string | null;
  promptPrefix: string | null;
  model: string;
  user: string | null;
  suggestions: string[];
  messages: TMessage[];
  createdAt: string;
  updatedAt: string;
  toneStyle: string;
};

export type TPrompt = {
  title: string;
  prompt: string;
  category: string;
  createdAt: string;
  updatedAt: string;
};

export type TCustomPrompt = {
  chatGptLabel: string;
  promptPrefix: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  _id: string;
};

export type TModel = {
  _id: string;
  name: string;
  value: string;
  model: string;
  chatGptLabel?: string;
  promptPrefix?: string;
};

export type TUser = {};

export type TGetConversationsResponse = {
  conversations: TConversation[];
  pageNumber: string;
  pageSize: string | number;
  pages: string | number;
};

export type TGetConversationResponse = {
  data: TConversation;
};

export type TGetMessagesResponse = {
  data: TMessage[];
};

export type TDeleteConversationRequest = {
  conversationId: string;
};

export type TAICompletionRequest = {
  chatGptLabel?: string;
  conversationId: string;
  current: boolean;
  isCreatedByUser: boolean;
  model: string;
  messageId: string;
  parentMessageId: string;
  overrideParentMessageId?: boolean;
  promptPrefix?: string;
  sender: string;
  text: string;
};

export type TGetModelsResponse = {
  hasOpenAI: boolean;
  hasChatGpt: boolean;
  hasBing: boolean;
};

export type TOpenAIModel = {
  object: string;
  id: string;
  ready: boolean;
  owner: string;
  created: string | null;
  permissions: string[] | null;
};

export type TOpenAIModels = {
  models: {
    object: string;
    data: TOpenAIModel[];
  };
};

export type TConversationUpdate = {
  conversationId: string;
  title?: string;
};
export type TUpdateConversationRequest = {
  arg: {};
  withCredentials?: boolean;
};

export type TUpdateConversationResponse = {
  data: TConversation;
};

export type TUpdateCustomGptRequest = {
  value: string;
  chatGptLabel: string;
  promptPrefix?: string;
  prevLabel?: string;
};

export type TUpdateCustomGptResponse = {};

export type TDeleteCustomGptRequest = {
  id: string;
};

export type TDeleteCustomGptResponse = {};

export type TClearConversationsRequest = {};

export type TClearConversationsResponse = {};

export type TGetCustomGptsResponse = {};