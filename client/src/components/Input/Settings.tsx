import React from 'react';
import {
  OpenAISettings,
  BingAISettings,
  AnthropicSettings,
} from '~/components/Endpoints/Settings/';
import { GoogleSettings } from '~/components/Endpoints/Settings/MultiView';
import { SelectProps, OptionComponent, MultiViewComponent } from 'librechat-data-provider';

const optionComponents: { [key: string]: OptionComponent } = {
  openAI: OpenAISettings,
  bingAI: BingAISettings,
  anthropic: AnthropicSettings,
};

const multiViewComponents: { [key: string]: MultiViewComponent } = {
  google: GoogleSettings,
};

export default function Settings({ conversation, setOption }: SelectProps) {
  if (!conversation?.endpoint) {
    return null;
  }

  const { endpoint } = conversation;
  const OptionComponent = optionComponents[endpoint];

  if (OptionComponent) {
    return <OptionComponent conversation={conversation} setOption={setOption} />;
  }

  const MultiViewComponent = multiViewComponents[endpoint];

  if (!MultiViewComponent) {
    return null;
  }

  return <MultiViewComponent />;
}
