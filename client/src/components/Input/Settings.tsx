import React from 'react';
import {
  OpenAISettings,
  BingAISettings,
  AnthropicSettings,
} from '~/components/Endpoints/Settings/';
import { SelectProps, SettingsProps } from 'librechat-data-provider';

type OptionComponentType = React.FC<SettingsProps>;

const optionComponents: { [key: string]: OptionComponentType } = {
  openAI: OpenAISettings,
  bingAI: BingAISettings,
  anthropic: AnthropicSettings,
};

export default function Settings({ conversation, setOption }: SelectProps) {
  if (!conversation?.endpoint) {
    return null;
  }

  const { endpoint } = conversation;
  const OptionComponent = optionComponents[endpoint];

  if (!OptionComponent) {
    return null;
  }

  return <OptionComponent conversation={conversation} setOption={setOption} />;
}
