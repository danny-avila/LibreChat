import React from 'react';
import { FileSources } from 'librechat-data-provider';
import type * as InputNumberPrimitive from 'rc-input-number';
import type { ColumnDef } from '@tanstack/react-table';
import type { SetterOrUpdater } from 'recoil';
import type {
  TRole,
  TUser,
  Action,
  TPreset,
  TPlugin,
  TMessage,
  Assistant,
  TResPlugin,
  TLoginUser,
  AuthTypeEnum,
  TModelsConfig,
  TConversation,
  TStartupConfig,
  EModelEndpoint,
  AssistantsEndpoint,
  TMessageContentParts,
  AuthorizationTypeEnum,
  TSetOption as SetOption,
  TokenExchangeMethodEnum,
} from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';

export enum PromptsEditorMode {
  SIMPLE = 'simple',
  ADVANCED = 'advanced',
}

export type AudioChunk = {
  audio: string;
  isFinal: boolean;
  alignment: {
    char_start_times_ms: number[];
    chars_durations_ms: number[];
    chars: string[];
  };
  normalizedAlignment: {
    char_start_times_ms: number[];
    chars_durations_ms: number[];
    chars: string[];
  };
};

export type AssistantListItem = {
  id: string;
  name: string;
  metadata: Assistant['metadata'];
  model: string;
};

export type TPluginMap = Record<string, TPlugin>;

export type GenericSetter<T> = (value: T | ((currentValue: T) => T)) => void;

export type LastSelectedModels = Record<EModelEndpoint, string>;

export type LocalizeFunction = (phraseKey: string, ...values: string[]) => string;

export type ChatFormValues = { text: string };

export const mainTextareaId = 'prompt-textarea';
export const globalAudioId = 'global-audio';

export enum IconContext {
  landing = 'landing',
  menuItem = 'menu-item',
  nav = 'nav',
  message = 'message',
}

export type IconMapProps = {
  className?: string;
  iconURL?: string;
  context?: 'landing' | 'menu-item' | 'nav' | 'message';
  endpoint?: string | null;
  assistantName?: string;
  avatar?: string;
  size?: number;
};

export type NavLink = {
  title: string;
  label?: string;
  icon: LucideIcon | React.FC;
  Component?: React.ComponentType;
  onClick?: (e?: React.MouseEvent) => void;
  variant?: 'default' | 'ghost';
  id: string;
};

export interface NavProps {
  isCollapsed: boolean;
  links: NavLink[];
  resize?: (size: number) => void;
  defaultActive?: string;
}

interface ColumnMeta {
  meta: {
    size: number | string;
  };
}

export enum Panel {
  builder = 'builder',
  actions = 'actions',
}

export type FileSetter =
  | SetterOrUpdater<Map<string, ExtendedFile>>
  | React.Dispatch<React.SetStateAction<Map<string, ExtendedFile>>>;

export type ActionAuthForm = {
  /* General */
  type: AuthTypeEnum;
  saved_auth_fields: boolean;
  /* API key */
  api_key: string; // not nested
  authorization_type: AuthorizationTypeEnum;
  custom_auth_header: string;
  /* OAuth */
  oauth_client_id: string; // not nested
  oauth_client_secret: string; // not nested
  authorization_url: string;
  client_url: string;
  scope: string;
  token_exchange_method: TokenExchangeMethodEnum;
};

export type AssistantPanelProps = {
  index?: number;
  action?: Action;
  actions?: Action[];
  assistant_id?: string;
  activePanel?: string;
  endpoint: AssistantsEndpoint;
  version: number | string;
  setAction: React.Dispatch<React.SetStateAction<Action | undefined>>;
  setCurrentAssistantId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setActivePanel: React.Dispatch<React.SetStateAction<Panel>>;
};

export type AugmentedColumnDef<TData, TValue> = ColumnDef<TData, TValue> & ColumnMeta;

export type TSetOption = SetOption;

export type TSetExample = (
  i: number,
  type: string,
  newValue: number | string | boolean | null,
) => void;

export type OnInputNumberChange = InputNumberPrimitive.InputNumberProps['onChange'];

export const defaultDebouncedDelay = 450;

export enum ESide {
  Top = 'top',
  Right = 'right',
  Bottom = 'bottom',
  Left = 'left',
}

export enum NotificationSeverity {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
}

export type TShowToast = {
  message: string;
  severity?: NotificationSeverity;
  showIcon?: boolean;
  duration?: number;
  status?: 'error' | 'success' | 'warning' | 'info';
};

export type TBaseSettingsProps = {
  conversation: TConversation | TPreset | null;
  className?: string;
  isPreset?: boolean;
  readonly?: boolean;
};

export type TSettingsProps = TBaseSettingsProps & {
  setOption: TSetOption;
};

export type TModels = {
  models: string[];
  showAbove?: boolean;
  popover?: boolean;
};

export type TModelSelectProps = TSettingsProps & TModels;

export type TEditPresetProps = {
  open: boolean;
  onOpenChange: React.Dispatch<React.SetStateAction<boolean>>;
  preset: TPreset;
  title?: string;
};

export type TSetOptions = (options: Record<string, unknown>) => void;
export type TSetOptionsPayload = {
  setOption: TSetOption;
  setExample: TSetExample;
  addExample: () => void;
  removeExample: () => void;
  setAgentOption: TSetOption;
  // getConversation: () => TConversation | TPreset | null;
  checkPluginSelection: (value: string) => boolean;
  setTools: (newValue: string, remove?: boolean) => void;
  setOptions?: TSetOptions;
};

export type TPresetItemProps = {
  preset: TPreset;
  value: TPreset;
  onSelect: (preset: TPreset) => void;
  onChangePreset: (preset: TPreset) => void;
  onDeletePreset: (preset: TPreset) => void;
};

export type TOnClick = (e: React.MouseEvent<HTMLButtonElement>) => void;

export type TGenButtonProps = {
  onClick: TOnClick;
};

export type TAskProps = {
  text: string;
  overrideConvoId?: string;
  overrideUserMessageId?: string;
  parentMessageId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
};

export type TOptions = {
  editedMessageId?: string | null;
  editedText?: string | null;
  resubmitFiles?: boolean;
  isRegenerate?: boolean;
  isContinued?: boolean;
  isEdited?: boolean;
  overrideMessages?: TMessage[];
};

export type TAskFunction = (props: TAskProps, options?: TOptions) => void;

export type TMessageProps = {
  conversation?: TConversation | null;
  messageId?: string | null;
  message?: TMessage;
  messagesTree?: TMessage[];
  currentEditId: string | number | null;
  isSearchView?: boolean;
  siblingIdx?: number;
  siblingCount?: number;
  setCurrentEditId?: React.Dispatch<React.SetStateAction<string | number | null>> | null;
  setSiblingIdx?: ((value: number) => void | React.Dispatch<React.SetStateAction<number>>) | null;
};

export type TInitialProps = {
  text: string;
  edit: boolean;
  error: boolean;
  unfinished: boolean;
  isSubmitting: boolean;
  isLast: boolean;
};
export type TAdditionalProps = {
  ask: TAskFunction;
  message: TMessage;
  isCreatedByUser: boolean;
  siblingIdx: number;
  enterEdit: (cancel: boolean) => void;
  setSiblingIdx: (value: number) => void;
};

export type TMessageContentProps = TInitialProps & TAdditionalProps;

export type TText = Pick<TInitialProps, 'text'> & { className?: string };
export type TEditProps = Pick<TInitialProps, 'text' | 'isSubmitting'> &
  Omit<TAdditionalProps, 'isCreatedByUser'>;
export type TDisplayProps = TText &
  Pick<TAdditionalProps, 'isCreatedByUser' | 'message'> & {
    showCursor?: boolean;
  };

export type TConfigProps = {
  userKey: string;
  setUserKey: React.Dispatch<React.SetStateAction<string>>;
  endpoint: EModelEndpoint | string;
};

export type TDangerButtonProps = {
  id: string;
  confirmClear: boolean;
  className?: string;
  disabled?: boolean;
  showText?: boolean;
  mutation?: UseMutationResult<unknown>;
  onClick: () => void;
  infoTextCode: string;
  actionTextCode: string;
  dataTestIdInitial: string;
  dataTestIdConfirm: string;
  infoDescriptionCode?: string;
  confirmActionTextCode?: string;
};

export type TDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export type TPluginStoreDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
};

export type TResError = {
  response: { data: { message: string } };
  message: string;
};

export type TAuthContext = {
  user: TUser | undefined;
  token: string | undefined;
  isAuthenticated: boolean;
  error: string | undefined;
  login: (data: TLoginUser) => void;
  logout: () => void;
  setError: React.Dispatch<React.SetStateAction<string | undefined>>;
  roles?: Record<string, TRole | null | undefined>;
};

export type TUserContext = {
  user?: TUser | undefined;
  token: string | undefined;
  isAuthenticated: boolean;
  redirect?: string;
};

export type TAuthConfig = {
  loginRedirect: string;
  test?: boolean;
};

export type IconProps = Pick<TMessage, 'isCreatedByUser' | 'model'> &
  Pick<TConversation, 'chatGptLabel' | 'modelLabel' | 'jailbreak'> & {
    size?: number;
    button?: boolean;
    iconURL?: string;
    message?: boolean;
    className?: string;
    iconClassName?: string;
    endpoint?: EModelEndpoint | string | null;
    endpointType?: EModelEndpoint | null;
    assistantName?: string;
    error?: boolean;
  };

export type Option = Record<string, unknown> & {
  label?: string;
  value: string | number | null;
};

export type VoiceOption = {
  value: string;
  label: string;
};

export type TMessageAudio = {
  messageId?: string;
  content?: TMessageContentParts[] | string;
  className?: string;
  isLast: boolean;
  index: number;
};

export type OptionWithIcon = Option & { icon?: React.ReactNode };
export type MentionOption = OptionWithIcon & {
  type: string;
  value: string;
  description?: string;
};
export type PromptOption = MentionOption & {
  id: string;
};

export type TOptionSettings = {
  showExamples?: boolean;
  isCodeChat?: boolean;
};

export interface ExtendedFile {
  file?: File;
  file_id: string;
  temp_file_id?: string;
  type?: string;
  filepath?: string;
  filename?: string;
  width?: number;
  height?: number;
  size: number;
  preview?: string;
  progress: number;
  source?: FileSources;
  attached?: boolean;
  embedded?: boolean;
}

export type ContextType = { navVisible: boolean; setNavVisible: (visible: boolean) => void };

export interface SwitcherProps {
  endpoint?: EModelEndpoint | null;
  endpointKeyProvided: boolean;
  isCollapsed: boolean;
}
export type TLoginLayoutContext = {
  startupConfig: TStartupConfig | null;
  startupConfigError: unknown;
  isFetching: boolean;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  headerText: string;
  setHeaderText: React.Dispatch<React.SetStateAction<string>>;
};

export type NewConversationParams = {
  template?: Partial<TConversation>;
  preset?: Partial<TPreset>;
  modelsData?: TModelsConfig;
  buildDefault?: boolean;
  keepLatestMessage?: boolean;
  keepAddedConvos?: boolean;
};

export type ConvoGenerator = (params: NewConversationParams) => void | TConversation;

export type TResData = {
  plugin?: TResPlugin;
  final?: boolean;
  initial?: boolean;
  previousMessages?: TMessage[];
  requestMessage: TMessage;
  responseMessage: TMessage;
  conversation: TConversation;
  conversationId?: string;
  runMessages?: TMessage[];
};
export type TVectorStore = {
  _id: string;
  object: 'vector_store';
  created_at: string | Date;
  name: string;
  bytes?: number;
  file_counts?: {
    in_progress: number;
    completed: number;
    failed: number;
    cancelled: number;
    total: number;
  };
};

export type TThread = { id: string; createdAt: string };
