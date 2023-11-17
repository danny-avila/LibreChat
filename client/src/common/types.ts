import type {
  TConversation,
  TMessage,
  TPreset,
  TMutation,
  TLoginUser,
  TUser,
} from 'librechat-data-provider';
import { EModelEndpoint } from 'librechat-data-provider';

export type TSetOption = (param: number | string) => (newValue: number | string | boolean) => void;
export type TSetExample = (
  i: number,
  type: string,
  newValue: number | string | boolean | null,
) => void;

export const alternateName = {
  [EModelEndpoint.openAI]: 'OpenAI',
  [EModelEndpoint.assistant]: 'Assistants',
  [EModelEndpoint.azureOpenAI]: 'Azure OpenAI',
  [EModelEndpoint.bingAI]: 'Bing',
  [EModelEndpoint.chatGPTBrowser]: 'ChatGPT',
  [EModelEndpoint.gptPlugins]: 'Plugins',
  [EModelEndpoint.google]: 'PaLM',
  [EModelEndpoint.anthropic]: 'Anthropic',
};

export const supportsFiles = {
  [EModelEndpoint.openAI]: true,
  [EModelEndpoint.assistant]: true,
};

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
  setTools: (newValue: string) => void;
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
  scrollToBottom?: () => void;
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

export type TMessageContent = TInitialProps & TAdditionalProps;

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
  endpoint: string;
};

export type TDangerButtonProps = {
  id: string;
  confirmClear: boolean;
  className?: string;
  disabled?: boolean;
  showText?: boolean;
  mutation?: TMutation;
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

export type IconProps = Pick<TMessage, 'isCreatedByUser' | 'model' | 'error'> &
  Pick<TConversation, 'chatGptLabel' | 'modelLabel' | 'jailbreak'> & {
    size?: number;
    button?: boolean;
    message?: boolean;
    className?: string;
    endpoint?: string | null;
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
  file: File;
  width?: number;
  height?: number;
  preview: string;
  progress: number;
}

export type ContextType = { navVisible: boolean; setNavVisible: (visible: boolean) => void };
