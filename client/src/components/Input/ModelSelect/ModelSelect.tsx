import type { TConversation } from 'librechat-data-provider';
import type { TSetOption } from '~/common';
import { options, multiChatOptions } from './options';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';

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
  const modelsQuery = useGetModelsQuery();

  if (!conversation?.endpoint) {
    return null;
  }

  const { endpoint: _endpoint, endpointType } = conversation;
  const models = modelsQuery?.data?.[_endpoint] ?? [];
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
