import OpenAI from 'openai';
import type {
  TResPlugin,
  TMessage,
  TConversation,
  EModelEndpoint,
  ImageDetail,
  TSharedLink,
} from './schemas';
import type { TSpecsConfig } from './models';
export type TOpenAIMessage = OpenAI.Chat.ChatCompletionMessageParam;
export type TOpenAIFunction = OpenAI.Chat.ChatCompletionCreateParams.Function;
export type TOpenAIFunctionCall = OpenAI.Chat.ChatCompletionCreateParams.FunctionCallOption;

export * from './schemas';

export type TMessages = TMessage[];

export type TMessagesAtom = TMessages | null;

/* TODO: Cleanup EndpointOption types */
export type TEndpointOption = {
  endpoint: EModelEndpoint;
  endpointType?: EModelEndpoint;
  modelDisplayLabel?: string;
  resendFiles?: boolean;
  maxContextTokens?: number;
  imageDetail?: ImageDetail;
  model?: string | null;
  promptPrefix?: string;
  temperature?: number;
  chatGptLabel?: string | null;
  modelLabel?: string | null;
  jailbreak?: boolean;
  key?: string | null;
  /* assistant */
  thread_id?: string;
};

export type TPayload = Partial<TMessage> &
  Partial<TEndpointOption> & {
    isContinued: boolean;
    conversationId: string | null;
    messages?: TMessages;
  };

export type TSubmission = {
  plugin?: TResPlugin;
  plugins?: TResPlugin[];
  userMessage: TMessage;
  isEdited?: boolean;
  isContinued?: boolean;
  messages: TMessage[];
  isRegenerate?: boolean;
  conversationId?: string;
  initialResponse: TMessage;
  conversation: Partial<TConversation>;
  endpointOption: TEndpointOption;
};

export type TPluginAction = {
  pluginKey: string;
  action: 'install' | 'uninstall';
  auth?: unknown;
  isAssistantTool?: boolean;
};

export type GroupedConversations = [key: string, TConversation[]][];

export type TUpdateUserPlugins = {
  isAssistantTool?: boolean;
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
  model: string;
  text: string;
};

export type TUpdateUserKeyRequest = {
  name: string;
  value: string;
  expiresAt: string;
};

export type TUpdateConversationRequest = {
  conversationId: string;
  title: string;
};

export type TUpdateConversationResponse = TConversation;

export type TDeleteConversationRequest = {
  conversationId?: string;
  thread_id?: string;
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

export type TArchiveConversationRequest = {
  conversationId: string;
  isArchived: boolean;
};

export type TArchiveConversationResponse = TConversation;

export type TSharedMessagesResponse = Omit<TSharedLink, 'messages'> & {
  messages: TMessage[];
};
export type TSharedLinkRequest = Partial<
  Omit<TSharedLink, 'messages' | 'createdAt' | 'updatedAt'>
> & {
  conversationId: string;
};

export type TSharedLinkResponse = TSharedLink;
export type TSharedLinksResponse = TSharedLink[];
export type TDeleteSharedLinkResponse = TSharedLink;

export type TForkConvoRequest = {
  messageId: string;
  conversationId: string;
  option?: string;
  splitAtTarget?: boolean;
  latestMessageId?: string;
};

export type TForkConvoResponse = {
  conversation: TConversation;
  messages: TMessage[];
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
  order: number;
  type?: EModelEndpoint;
  azure?: boolean;
  availableTools?: [];
  plugins?: Record<string, string>;
  name?: string;
  iconURL?: string;
  version?: string;
  modelDisplayLabel?: string;
  userProvide?: boolean | null;
  userProvideURL?: boolean | null;
  disableBuilder?: boolean;
  retrievalModels?: string[];
  capabilities?: string[];
};

export type TEndpointsConfig =
  | Record<EModelEndpoint | string, TConfig | null | undefined>
  | undefined;

export type TModelsConfig = Record<string, string[]>;

export type TUpdateTokenCountResponse = {
  count: number;
};

export type TMessageTreeNode = object;

export type TSearchMessage = object;

export type TSearchMessageTreeNode = object;

export type TRegisterUserResponse = {
  message: string;
};

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

export type VerifyEmailResponse = { message: string };

export type TVerifyEmail = {
  email: string;
  token: string;
};

export type TResendVerificationEmail = Omit<TVerifyEmail, 'token'>;

export type TInterfaceConfig = {
  privacyPolicy?: {
    externalUrl?: string;
    openNewTab?: boolean;
  };
  termsOfService?: {
    externalUrl?: string;
    openNewTab?: boolean;
  };
  endpointsMenu: boolean;
  modelSelect: boolean;
  parameters: boolean;
  sidePanel: boolean;
  presets: boolean;
};

export type TStartupConfig = {
  appTitle: string;
  socialLogins?: string[];
  interface?: TInterfaceConfig;
  discordLoginEnabled: boolean;
  facebookLoginEnabled: boolean;
  githubLoginEnabled: boolean;
  googleLoginEnabled: boolean;
  openidLoginEnabled: boolean;
  openidLabel: string;
  openidImageUrl: string;
  ldapLoginEnabled: boolean;
  serverDomain: string;
  emailLoginEnabled: boolean;
  registrationEnabled: boolean;
  socialLoginEnabled: boolean;
  passwordResetEnabled: boolean;
  emailEnabled: boolean;
  checkBalance: boolean;
  showBirthdayIcon: boolean;
  helpAndFaqURL: string;
  customFooter?: string;
  modelSpecs?: TSpecsConfig;
  sharedLinksEnabled: boolean;
  publicSharedLinksEnabled: boolean;
  analyticsGtmId?: string;
};

export type TRefreshTokenResponse = {
  token: string;
  user: TUser;
};

export type TCheckUserKeyResponse = {
  expiresAt: string;
};

export type TRequestPasswordResetResponse = {
  link?: string;
  message?: string;
};

/**
 * Represents the response from the import endpoint.
 */
export type TImportResponse = {
  /**
   * The message associated with the response.
   */
  message: string;
};
