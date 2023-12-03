import type { TPreset } from 'librechat-data-provider';
import { EModelEndpoint } from 'librechat-data-provider';

export const getPresetIcon = (preset: TPreset, Icon) => {
  return Icon({
    size: 20,
    endpoint: preset?.endpoint,
    model: preset?.model,
    error: false,
    className: 'icon-md',
    isCreatedByUser: false,
  });
};

export const getPresetTitle = (preset: TPreset) => {
  const { endpoint, title: presetTitle } = preset;
  const { chatGptLabel, modelLabel, model, jailbreak, toneStyle } = preset;
  let _title = '';
  let label = '';

  if (endpoint === EModelEndpoint.azureOpenAI || endpoint === EModelEndpoint.openAI) {
    if (chatGptLabel) {
      label = ': ' + chatGptLabel;
    }
    if (model) {
      _title += model;
    }
  } else if (endpoint === EModelEndpoint.google || endpoint === EModelEndpoint.anthropic) {
    if (modelLabel) {
      label = ': ' + modelLabel;
    }
    if (model) {
      _title += model;
    }
  } else if (endpoint === EModelEndpoint.bingAI) {
    if (jailbreak) {
      _title = 'Sydney';
    }
    if (toneStyle) {
      _title += `: ${toneStyle}`;
    }
  } else if (endpoint === EModelEndpoint.chatGPTBrowser) {
    if (model) {
      _title += model;
    }
  } else if (endpoint === EModelEndpoint.gptPlugins) {
    if (model) {
      _title += model;
    }
  }

  if (
    presetTitle &&
    presetTitle.length > 0 &&
    presetTitle.trim() !== 'New Chat' &&
    !label.includes(presetTitle)
  ) {
    _title += ': ' + presetTitle;
  }
  return `${_title}${label}`;
};
