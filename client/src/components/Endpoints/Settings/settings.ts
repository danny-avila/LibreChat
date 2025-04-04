import { EModelEndpoint } from 'librechat-data-provider';
import type { FC } from 'react';
import type { TModelSelectProps } from '~/common';
import { GoogleSettings, PluginSettings } from './MultiView';
import AssistantsSettings from './Assistants';
import AnthropicSettings from './Anthropic';
import BedrockSettings from './Bedrock';
import OpenAISettings from './OpenAI';

const settings: { [key: string]: FC<TModelSelectProps> | undefined } = {
  [EModelEndpoint.assistants]: AssistantsSettings,
  [EModelEndpoint.azureAssistants]: AssistantsSettings,
  [EModelEndpoint.agents]: OpenAISettings,
  [EModelEndpoint.openAI]: OpenAISettings,
  [EModelEndpoint.custom]: OpenAISettings,
  [EModelEndpoint.azureOpenAI]: OpenAISettings,
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
