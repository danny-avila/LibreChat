import { EModelEndpoint } from 'librechat-data-provider';
import OpenAISettings from './OpenAI';
import BingAISettings from './BingAI';
import AnthropicSettings from './Anthropic';
import { Google, Plugins, GoogleSettings, PluginSettings } from './MultiView';
import type { FC } from 'react';
import type { TModelSelectProps, TBaseSettingsProps, TModels } from '~/common';

const settings: { [key: string]: FC<TModelSelectProps> } = {
  [EModelEndpoint.openAI]: OpenAISettings,
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
