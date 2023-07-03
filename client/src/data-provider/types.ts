export type TMessage = {
  messageId: string;
  conversationId: string;
  clientId: string;
  parentMessageId: string;
  sender: string;
  text: string;
  isCreatedByUser: boolean;
  error: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TExample = {
  input: string;
  output: string;
};

export type TPluginAuthConfig = {
  authField: string;
  label: string;
  description: string;
};

export type TPlugin = {
  name: string;
  pluginKey: string;
  description: string;
  icon: string;
  authConfig: TPluginAuthConfig[];
  authenticated: boolean;
};

export enum EModelEndpoint {
  azureOpenAI = 'azureOpenAI',
  openAI = 'openAI',
  bingAI = 'bingAI',
  chatGPT = 'chatGPT',
  chatGPTBrowser = 'chatGPTBrowser',
  google = 'google',
  gptPlugins = 'gptPlugins'
}

export type TConversation = {
  conversationId: string;
  title: string;
  user?: string;
  endpoint: EModelEndpoint;
  suggestions?: string[];
  messages?: TMessage[];
  tools?: TPlugin[];
  createdAt: string;
  updatedAt: string;
  // google only
  modelLabel?: string;
  examples?: TExample[];
  // for azureOpenAI, openAI only
  chatGptLabel?: string;
  userLabel?: string;
  model?: string;
  promptPrefix?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  // bing and google
  context?: string;
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
};

export type TSubmission = {
  conversation?: TConversation;
  message?: TMessage;
  endpointOption?: object;
  clientId?: string;
  context?: string;
  conversationId?: string;
  conversationSignature?: string;
  current: boolean;
  endpoint: EModelEndpoint;
  invocationId: number;
  isCreatedByUser: boolean;
  jailbreak: boolean;
  jailbreakConversationId?: string;
  messageId: string;
  overrideParentMessageId?: string | boolean;
  parentMessageId?: string;
  sender: string;
  systemMessage?: string;
  text: string;
  toneStyle?: string;
  model?: string;
  promptPrefix?: string;
  temperature?: number;
  top_p?: number;
  presence_penalty?: number;
  frequence_penalty?: number;
};

export type TUpdateUserPlugins = {
  pluginKey: string;
  action: string;
  auth?: unknown;
};

export type TPreset = {
  title: string;
  endpoint: EModelEndpoint;
  conversationSignature?: string;
  createdAt?: string;
  updatedAt?: string;
  presetId?: string;
  user?: string;
  // for azureOpenAI, openAI only
  chatGptLabel?: string;
  frequence_penalty?: number;
  model?: string;
  presence_penalty?: number;
  promptPrefix?: string;
  temperature?: number;
  top_p?: number;
  //for BingAI
  clientId?: string;
  invocationId?: number;
  jailbreak?: boolean;
  jailbreakPresetId?: string;
  presetSignature?: string;
  toneStyle?: string;
};

export type TUser = {
  id: string;
  username: string;
  email: string;
  name: string;
  avatar: string;
  role: string;
  provider: string;
  plugins: string[];
  createdAt: string;
  updatedAt: string;
};

export type TGetConversationsResponse = {
  conversations: TConversation[];
  pageNumber: string;
  pageSize: string | number;
  pages: string | number;
};

export type TUpdateConversationRequest = {
  conversationId: string;
  title: string;
};

export type TUpdateConversationResponse = {
  data: TConversation;
};

export type TDeleteConversationRequest = {
  conversationId?: string;
  source?: string;
};

export type TDeleteConversationResponse = {
  acknowledged: boolean;
  deletedCount: number;
  messages: {
    acknowledged: boolean;
    deletedCount: number;
  };
};

export type TSearchResults = {
  conversations: TConversation[];
  messages: TMessage[];
  pageNumber: string;
  pageSize: string | number;
  pages: string | number;
  filter: object;
};

export type TEndpoints = {
  azureOpenAI: boolean;
  bingAI: boolean;
  ChatGptBrowser: {
    availableModels: [];
  };
  OpenAI: {
    availableModels: [];
  };
};

export type TUpdateTokenCountResponse = {
  count: number;
};

export type TMessageTreeNode = object;

export type TSearchMessage = object;

export type TSearchMessageTreeNode = object;

export type TRegisterUser = {
  name: string;
  email: string;
  username: string;
  password: string;
  confirm_password?: string;
};

export type TLoginUser = {
  email: string;
  password: string;
};

export type TLoginResponse = {
  token: string;
  user: TUser;
};

export type TRequestPasswordReset = {
  email: string;
};

export type TResetPassword = {
  userId: string;
  token: string;
  password: string;
};

export type TStartupConfig = {
  appTitle: boolean;
  googleLoginEnabled: boolean;
  openidLoginEnabled: boolean;
  openidLabel: string;
  openidImageUrl: string;
  serverDomain: string;
  registrationEnabled: boolean;
}
