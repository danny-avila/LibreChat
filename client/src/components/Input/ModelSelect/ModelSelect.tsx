import React from 'react';
import OpenAI from './OpenAI';
import BingAI from './BingAI';
import Google from './Google';
import Plugins from './Plugins';
import ChatGPT from './ChatGPT';
import Anthropic from './Anthropic';
import { useRecoilValue } from 'recoil';
import type { TConversation } from 'librechat-data-provider';
import type { TSetOption, TModelSelectProps } from '~/common';
import store from '~/store';

type TGoogleProps = {
  showExamples: boolean;
  isCodeChat: boolean;
};

type TSelectProps = {
  conversation: TConversation | null;
  setOption: TSetOption;
  extraProps?: TGoogleProps;
};

const optionComponents: { [key: string]: React.FC<TModelSelectProps> } = {
  openAI: OpenAI,
  azureOpenAI: OpenAI,
  bingAI: BingAI,
  google: Google,
  gptPlugins: Plugins,
  anthropic: Anthropic,
  chatGPTBrowser: ChatGPT,
};

export default function ModelSelect({ conversation, setOption }: TSelectProps) {
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

  return <OptionComponent conversation={conversation} setOption={setOption} models={models} />;
}
