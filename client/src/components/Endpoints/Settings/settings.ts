import { EModelEndpoint } from 'librechat-data-provider';
import type { FC } from 'react';
import type { TModelSelectProps } from '~/common';
import { GoogleSettings, PluginSettings } from './MultiView';
import AssistantsSettings from './Assistants';
import AnthropicSettings from './Anthropic';
import BedrockSettings from './Bedrock';
import BingAISettings from './BingAI';
import OpenAISettings from './OpenAIQima';

const settings: { [key: string]: FC<TModelSelectProps> } = {
  [EModelEndpoint.assistants]: AssistantsSettings,
  [EModelEndpoint.azureAssistants]: AssistantsSettings,
  [EModelEndpoint.agents]: OpenAISettings,
  [EModelEndpoint.openAI]: OpenAISettings,
  [EModelEndpoint.custom]: OpenAISettings,
  [EModelEndpoint.azureOpenAI]: OpenAISettings,
  [EModelEndpoint.bingAI]: BingAISettings,
  [EModelEndpoint.anthropic]: AnthropicSettings,
  [EModelEndpoint.bedrock]: BedrockSettings,
};

export const getSettings = () => {
  return {
    settings,
    multiViewSettings: {
      [EModelEndpoint.google]: GoogleSettings,
      [EModelEndpoint.gptPlugins]: PluginSettings,
    },
  };
};
