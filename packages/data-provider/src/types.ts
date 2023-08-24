import type { TResPlugin, TMessage, TConversation, TEndpointOption } from './schemas';

export * from './schemas';

export type TMessages = TMessage[];

export type TMessagesAtom = TMessages | null;

export type TSubmission = {
  plugin?: TResPlugin;
  plugins?: TResPlugin[];
  message: TMessage;
  isEdited?: boolean;
  isContinued?: boolean;
  messages: TMessage[];
  isRegenerate?: boolean;
  conversationId?: string;
  initialResponse: TMessage;
  conversation: TConversation;
  endpointOption: TEndpointOption;
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
    status?: number;
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

export type TUpdateMessageRequest = {
  conversationId: string;
  messageId: string;
  text: string;
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

export type TConfig = {
  availableModels: [];
  userProvide?: boolean | null;
  availableTools?: [];
  plugins?: [];
};

export type TEndpointsConfig = {
  azureOpenAI: TConfig | null;
  bingAI: TConfig | null;
  chatGPTBrowser: TConfig | null;
  anthropic: TConfig | null;
  google: TConfig | null;
  openAI: TConfig | null;
  gptPlugins: TConfig | null;
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
  appTitle: string;
  googleLoginEnabled: boolean;
  facebookLoginEnabled: boolean;
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
