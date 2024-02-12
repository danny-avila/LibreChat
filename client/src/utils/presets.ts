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

type TEndpoints = Array<string | EModelEndpoint>;

export const getPresetTitle = (preset: TPreset) => {
  const {
    endpoint,
    title: presetTitle,
    model,
    chatGptLabel,
    modelLabel,
    jailbreak,
    toneStyle,
  } = preset;
  let title = '';
  let modelInfo = model || '';
  let label = '';

  const usesChatGPTLabel: TEndpoints = [
    EModelEndpoint.azureOpenAI,
    EModelEndpoint.openAI,
    EModelEndpoint.custom,
  ];
  const usesModelLabel: TEndpoints = [EModelEndpoint.google, EModelEndpoint.anthropic];

  if (endpoint && usesChatGPTLabel.includes(endpoint)) {
    label = chatGptLabel || '';
  } else if (endpoint && usesModelLabel.includes(endpoint)) {
    label = modelLabel || '';
  } else if (endpoint === EModelEndpoint.bingAI) {
    modelInfo = jailbreak ? 'Sydney' : modelInfo;
    label = toneStyle ? `: ${toneStyle}` : '';
  }

  if (label && presetTitle && label.toLowerCase().includes(presetTitle.toLowerCase())) {
    title = label + ': ';
    label = '';
  } else if (presetTitle && presetTitle.trim() !== 'New Chat') {
    title = presetTitle + ': ';
  }

  return `${title}${modelInfo}${label ? ` (${label})` : ''}`.trim();
};
