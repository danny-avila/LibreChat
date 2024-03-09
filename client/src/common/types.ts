import { FileSources } from 'librechat-data-provider';
import type { ColumnDef } from '@tanstack/react-table';
import type { SetterOrUpdater } from 'recoil';
import type {
  TConversation,
  TMessage,
  TPreset,
  TLoginUser,
  TUser,
  EModelEndpoint,
  Action,
  AuthTypeEnum,
  AuthorizationTypeEnum,
  TokenExchangeMethodEnum,
} from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';

export type GenericSetter<T> = (value: T | ((currentValue: T) => T)) => void;

export type NavLink = {
  title: string;
  label?: string;
  icon: LucideIcon;
  Component?: React.ComponentType;
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
  setAction: React.Dispatch<React.SetStateAction<Action | undefined>>;
  setCurrentAssistantId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setActivePanel: React.Dispatch<React.SetStateAction<Panel>>;
};

export type AugmentedColumnDef<TData, TValue> = ColumnDef<TData, TValue> & ColumnMeta;

export type TSetOption = (
  param: number | string,
) => (newValue: number | string | boolean | Partial<TPreset>) => void;
export type TSetExample = (
  i: number,
  type: string,
  newValue: number | string | boolean | null,
) => void;

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

export type TSetOptionsPayload = {
  setOption: TSetOption;
  setExample: TSetExample;
  addExample: () => void;
  removeExample: () => void;
  setAgentOption: TSetOption;
  // getConversation: () => TConversation | TPreset | null;
  checkPluginSelection: (value: string) => boolean;
  setTools: (newValue: string, remove?: boolean) => void;
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
  parentMessageId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
};

export type TOptions = {
  editedMessageId?: string | null;
  editedText?: string | null;
  isRegenerate?: boolean;
  isContinued?: boolean;
  isEdited?: boolean;
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

export type TText = Pick<TInitialProps, 'text'>;
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
    endpoint?: EModelEndpoint | string | null;
    endpointType?: EModelEndpoint | null;
    assistantName?: string;
    error?: boolean;
  };

export type Option = Record<string, unknown> & {
  label?: string;
  value: string | number | null;
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
}

export type ContextType = { navVisible: boolean; setNavVisible: (visible: boolean) => void };
