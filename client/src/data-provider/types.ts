export type TMessage = {
  messageId: string,
  conversationId: string,
  // conversationSignature: string | null,
  clientId: string,
  // invocationId: string,
  parentMessageId: string,
  sender: string,
  text: string,
  isCreatedByUser: boolean,
  error: boolean,
  createdAt: string,
  updatedAt: string,
  // searchResult: string[],
  // submitting: boolean,
  // children?: any[] | undefined,
  // bgColor?: string,
  // model?: string,
  // cancelled?: boolean
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
  user?: string;
  endpoint: EModelEndpoint;
  suggestions?: string[];
  messages?: TMessage[];
  createdAt: string;
  updatedAt: string;
  // for azureOpenAI, openAI only
  chatGptLabel?: string;
  model?: string;
  promptPrefix?: string;
  temperature?: number;
  top_p?: number;
  presence_penalty?: number;
  // for bingAI only
  jailbreak?: boolean;
  jailbreakConversationId?: string;
  conversationSignature?: string;
  parentMessageId?: string;
  clientId?: string;
  invocationId?: string;
  toneStyle?: string;
}

export type TPreset = {
  title: string,
  endpoint: EModelEndpoint,
  conversationSignature?: string,
  createdAt?: string,
  updatedAt?: string,
  presetId?: string,
  user?: string,
  // for azureOpenAI, openAI only
  chatGptLabel?: string,
  frequence_penalty?: number,
  model?: string,
  presence_penalty?: number,
  promptPrefix?: string,
  temperature?: number,
  top_p?: number,
  //for BingAI
  clientId?: string,
  invocationId?: number,
  jailbreak?: boolean,
  jailbreakPresetId?: string,
  presetSignature?: string,
  toneStyle?: string,
}

export type TUser = {
  username: string,
  display: string
};

export type TGetConversationsResponse = {
  conversations: TConversation[],
  pageNumber: string,
  pageSize: string | number,
  pages: string | number
};

export type TUpdateConversationRequest = {
  conversationId: string,
  title: string,
};

export type TUpdateConversationResponse = {
  data: TConversation
};

export type TDeleteConversationRequest = {
  conversationId?: string,
  source?: string
}

export type TDeleteConversationResponse = {
  acknowledged: boolean,
  deletedCount: number,
  messages: {
    acknowledged: boolean,
    deletedCount: number
  }
};

export type TSearchResults = {
  conversations: TConversation[],
  messages: TMessage[],
  pageNumber: string,
  pageSize: string | number,
  pages: string | number
  filter: {}
};

export type TEndpoints = {
  azureOpenAI: boolean,
  bingAI: boolean,
  ChatGptBrowser: {
    availableModels: []
  }
  OpenAI: {
    availableModels: []
  }
};

export type TUpdateTokenCountResponse = {
  count: number,
};