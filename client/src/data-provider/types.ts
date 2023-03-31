export type TMessage = {
  messageId: string,
  conversationId: string,
  conversationSignature: string | null,
  clientId: string,
  invocationId: string,
  parentMessageId: string,
  sender: string,
  text: string,
  isCreatedByUser: boolean,
  error: boolean,
  createdAt: string,
  updatedAt: string,
  searchResult: string[],
  submitting: boolean,
  children?: any[] | undefined,
  bgColor?: string,
  model?: string,
  cancelled?: boolean
};

export type TMessageTreeNode = {}

export type TSearchMessage = {}

export type TSearchMessageTreeNode = {}

export type TMessageToAsk = {}


export enum EModelEndpoint {
  azureOpenAI = 'azureOpenAI', 
  openAI = 'openAI',
  bingAI = 'bingAI',
  chatGPTBrowser = 'chatGPTBrowser'
}

export type TConversation = {
  conversationId: string;
  title: string;
  user: string | null;
  endpoint: EModelEndpoint;
  model: string; // for azureOpenAI, openAI, chatGPTBrowser only, eg. gpt-3.5-turbo
  // for azureOpenAI, openAI only
  chatGptLabel?: string;
  promptPrefix?: string;
  temperature?: number;
  top_p?: number;
  presence_penalty?: number;
  // for bingAI only
  jailbreak?: boolean;
  jailbreakConversationId?: string;
  conversationSignature?: string;
  clientId?: string;
  invocationId?: string;
  toneStyle?: string;
  suggestions?: string[];
  messages?: TMessage[];
  createdAt: string;
  updatedAt: string;
}

export type TPrompt = {
  title: string,
  prompt: string,
  category: string,
  createdAt: string,
  updatedAt: string
};

export type TCustomGpt = {
  chatGptLabel: string,
  promptPrefix: string,
  value: string,
  createdAt: string,
  updatedAt: string,
  _id: string
};

export type TModel = {
  _id: string,
  name: string,
  value: string,
  model: string,
  chatGptLabel?: string,
  promptPrefix?: string
};

export type TUser = {};

export type TGetConversationsResponse = {
  conversations: TConversation[],
  pageNumber: string,
  pageSize: string | number,
  pages: string | number
};

export type TGetConversationResponse = {
  data: TConversation
};

export type TGetMessagesResponse = {
  data: TMessage[]
};

export type TDeleteConversationRequest = {
  conversationId: string
};

export type TAICompletionRequest = {
  chatGptLabel?: string,
  conversationId: string,
  current: boolean,
  isCreatedByUser: boolean,
  model: string,
  messageId: string,
  parentMessageId: string,
  overrideParentMessageId?: boolean,
  promptPrefix?: string,
  sender: string,
  text: string
};

export type TGetModelsResponse = {
  hasOpenAI: boolean,
  hasChatGpt: boolean,
  hasBing: boolean
};

export type TOpenAIModel = {
  object: string,
  id: string,
  ready: boolean,
  owner: string,
  created: string | null,
  permissions: string[] | null
};

export type TOpenAIModels = {
  models: {
    object: string,
    data: TOpenAIModel[]
  }
};

export type TConversationUpdate = {
  conversationId: string,
  title?: string
};
export type TUpdateConversationRequest = {
  arg: {},
  withCredentials?: boolean
};

export type TUpdateConversationResponse = {
  data: TConversation
};

export type TUpdateCustomGptRequest = {
  value: string,
  chatGptLabel: string,
  promptPrefix?: string,
  prevLabel?: string
};

export type TUpdateCustomGptResponse = {};

export type TDeleteCustomGptRequest = {
  id: string
};

export type TDeleteCustomGptResponse = {};

export type TClearConversationsRequest = {};

export type TClearConversationsResponse = {};

export type TGetCustomGptsResponse = {};

export type TSearchResults = {};