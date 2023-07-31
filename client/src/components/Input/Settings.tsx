import React from 'react';
import {
  OpenAISettings,
  BingAISettings,
  AnthropicSettings,
} from '~/components/Endpoints/Settings/';
import { GoogleView } from '~/components/Endpoints/Settings/SwitchViews';
import { SelectProps, OptionComponent } from 'librechat-data-provider';

const optionComponents: { [key: string]: OptionComponent } = {
  // google: GoogleView,
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
