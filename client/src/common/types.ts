import { TConversation, TMessage, TPreset } from 'librechat-data-provider';

export type TSetOption = (param: number | string) => (newValue: number | string | boolean) => void;
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
  getConversation: () => TConversation | TPreset | null;
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
