import type { TPreset } from 'librechat-data-provider';
import { EModelEndpoint, alternateName } from 'librechat-data-provider';

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
  const { endpoint } = preset;
  let _title = `${alternateName[endpoint ?? '']}`;
  const { chatGptLabel, modelLabel, model, jailbreak, toneStyle } = preset;

  if (endpoint === EModelEndpoint.azureOpenAI || endpoint === EModelEndpoint.openAI) {
    if (chatGptLabel) {
      _title = chatGptLabel;
    }
    if (model) {
      _title += `: ${model}`;
    }
  } else if (endpoint === EModelEndpoint.google) {
    if (modelLabel) {
      _title = modelLabel;
    }
    if (model) {
      _title += `: ${model}`;
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
      _title += `: ${model}`;
    }
  } else if (endpoint === EModelEndpoint.gptPlugins) {
    if (model) {
      _title += `: ${model}`;
    }
  } else if (endpoint === null) {
    null;
  } else {
    null;
  }
  return _title;
};
