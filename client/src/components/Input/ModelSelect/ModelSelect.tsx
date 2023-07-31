import React from 'react';
import OpenAI from './OpenAI';
import BingAI from './BingAI';
import ChatGPT from './ChatGPT';
import Anthropic from './Anthropic';
import { useRecoilValue } from 'recoil';
import { SelectProps, ModelSelectProps } from 'librechat-data-provider';
import store from '~/store';

type OptionComponentType = React.FC<ModelSelectProps>;

const optionComponents: { [key: string]: OptionComponentType } = {
  openAI: OpenAI,
  bingAI: BingAI,
  anthropic: Anthropic,
  chatGPTBrowser: ChatGPT,
};

export default function ModelSelect({ conversation, setOption, showBingTones }: SelectProps) {
  const endpointsConfig = useRecoilValue(store.endpointsConfig);
  if (!conversation?.endpoint) {
    return null;
  }

  const { endpoint } = conversation;
  const OptionComponent = optionComponents[endpoint];
  const models = endpointsConfig?.[endpoint]?.['availableModels'] ?? [];

  if (!OptionComponent) {
    return null;
  }

  let extraProps = {};
  if (endpoint === 'bingAI') {
    extraProps = { showBingTones };
  }

  return (
    <OptionComponent
      conversation={conversation}
      setOption={setOption}
      models={models}
      {...extraProps}
    />
  );
}
