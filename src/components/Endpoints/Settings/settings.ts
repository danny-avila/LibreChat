import { EModelEndpoint } from 'librechat-data-provider';
import type { FC } from 'react';
import type { TModelSelectProps, TBaseSettingsProps, TModels } from '~/common';
import { Google, Plugins, GoogleSettings, PluginSettings } from './MultiView';
import AnthropicSettings from './Anthropic';
import BingAISettings from './BingAI';
import OpenAISettings from './OpenAI';

const settings: { [key: string]: FC<TModelSelectProps> } = {
  [EModelEndpoint.openAI]: OpenAISettings,
  [EModelEndpoint.custom]: OpenAISettings,
  [EModelEndpoint.azureOpenAI]: OpenAISettings,
  [EModelEndpoint.bingAI]: BingAISettings,
  [EModelEndpoint.anthropic]: AnthropicSettings,
};

const multiViewSettings: { [key: string]: FC<TBaseSettingsProps & TModels> } = {
  [EModelEndpoint.google]: Google,
  [EModelEndpoint.gptPlugins]: Plugins,
};

export const getSettings = (isMultiChat = false) => {
  if (!isMultiChat) {
    return {
      settings,
      multiViewSettings,
    };
  }

  return {
    settings,
    multiViewSettings: {
      [EModelEndpoint.google]: GoogleSettings,
      [EModelEndpoint.gptPlugins]: PluginSettings,
    },
  };
};
