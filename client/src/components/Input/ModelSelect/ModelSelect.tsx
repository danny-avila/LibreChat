import React from 'react';
import OpenAI from './OpenAI';
import Anthropic from './Anthropic';
import { SelectProps, SettingsProps } from 'librechat-data-provider';

type OptionComponentType = React.FC<SettingsProps>;

const optionComponents: { [key: string]: OptionComponentType } = {
  openAI: OpenAI,
  anthropic: Anthropic,
};

export default function ModelSelect({ conversation, setOption }: SelectProps) {
  if (!conversation?.endpoint) {
    return null;
  }

  const { endpoint } = conversation;
  console.log('endpoint', endpoint);
  const OptionComponent = optionComponents[endpoint];

  if (!OptionComponent) {
    return null;
  }

  return <OptionComponent conversation={conversation} setOption={setOption} />;
}
