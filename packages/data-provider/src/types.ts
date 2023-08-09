import { TMessage, EModelEndpoint, TConversation } from './schemas';

export * from './schemas';

export type TMessages = TMessage[];

export type TMessagesAtom = TMessages | null;

export type TSubmission = {
  clientId?: string;
  context?: string;
  conversationId?: string;
  conversationSignature?: string;
  current: boolean;
  endpoint: EModelEndpoint | null;
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
  conversation: TConversation;
  message: TMessage;
  endpointOption: TEndpointOption;
};

export type TEndpointOption = {
  endpoint: EModelEndpoint | null;
  model?: string;
  promptPrefix?: string;
  temperature?: number;
};

export type TPluginAction = {
  pluginKey: string;
  action: 'install' | 'uninstall';
  auth?: unknown;
};

export type TUpdateUserPlugins = {
  pluginKey: string;
  action: string;
  auth?: unknown;
};

export type TError = {
  message: string;
  code?: number;
  response?: {
    data?: {
      message?: string;
    };
  };
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

export type TEndpointsConfig = {
  azureOpenAI: {
    availableModels: [];
  } | null;
  bingAI: {
    availableModels: [];
  } | null;
  chatGPTBrowser: {
    availableModels: [];
  } | null;
  anthropic: {
    availableModels: [];
  } | null;
  google: {
    availableModels: [];
  } | null;
  openAI: {
    availableModels: [];
  } | null;
  gptPlugins: {
    availableModels: [];
    availableTools?: [];
    plugins?: [];
  } | null;
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
  confirm_password?: string;
};

export type TStartupConfig = {
  appTitle: boolean;
  googleLoginEnabled: boolean;
  openidLoginEnabled: boolean;
  githubLoginEnabled: boolean;
  openidLabel: string;
  openidImageUrl: string;
  discordLoginEnabled: boolean;
  serverDomain: string;
  registrationEnabled: boolean;
  socialLoginEnabled: boolean;
  emailEnabled: boolean;
};

export type TRefreshTokenResponse = {
  token: string;
  user: TUser;
};

export type TRequestPasswordResetResponse = {
  link?: string;
  message?: string;
};
