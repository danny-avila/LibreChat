import { useRecoilValue } from 'recoil';
import type { TConversation } from 'librechat-data-provider';
import type { TSetOption } from '~/common';
import { options, multiChatOptions } from './options';
import store from '~/store';

type TGoogleProps = {
  showExamples: boolean;
  isCodeChat: boolean;
};

type TSelectProps = {
  conversation: TConversation | null;
  setOption: TSetOption;
  extraProps?: TGoogleProps;
  isMultiChat?: boolean;
  showAbove?: boolean;
};

export default function ModelSelect({
  conversation,
  setOption,
  isMultiChat = false,
  showAbove = true,
}: TSelectProps) {
  const modelsConfig = useRecoilValue(store.modelsConfig);
  if (!conversation?.endpoint) {
    return null;
  }

  const { endpoint: _endpoint, endpointType } = conversation;
  const models = modelsConfig?.[_endpoint] ?? [];
  const endpoint = endpointType ?? _endpoint;

  const OptionComponent = isMultiChat ? multiChatOptions[endpoint] : options[endpoint];

  if (!OptionComponent) {
    return null;
  }

  return (
    <OptionComponent
      conversation={conversation}
      setOption={setOption}
      models={models}
      showAbove={showAbove}
      popover={isMultiChat}
    />
  );
}
