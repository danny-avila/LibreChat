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

  if (
    endpoint &&
    [EModelEndpoint.azureOpenAI, EModelEndpoint.openAI, EModelEndpoint.custom].includes(endpoint)
  ) {
    label = chatGptLabel || '';
  } else if (endpoint && [EModelEndpoint.google, EModelEndpoint.anthropic].includes(endpoint)) {
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
