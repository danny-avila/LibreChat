import type { TPresetItemProps } from '~/common';
import type { TPreset } from 'librechat-data-provider';
import { EModelEndpoint } from 'librechat-data-provider';
import { Icon } from '~/components/Endpoints';

export default function PresetItem({
  index,
  preset = {} as TPreset,
  handlePresetClick,
}: {
  index: number;
  preset: TPreset;
  handlePresetClick: (preset: TPreset, index: number) => void;
}) {
  const { endpoint } = preset;

  const icon = Icon({
    size: 60,
    endpoint: preset?.endpoint,
    model: preset?.model,
    error: false,
    className: 'mr-2',
    isCreatedByUser: false,
  });

  const getPresetTitle = () => {
    let _title = `${endpoint}`;
    const { chatGptLabel, modelLabel, model, jailbreak, toneStyle } = preset;

    if (endpoint === EModelEndpoint.azureOpenAI || endpoint === EModelEndpoint.openAI) {
      if (model) {
        _title += `: ${model}`;
      }
      if (chatGptLabel) {
        _title += ` as ${chatGptLabel}`;
      }
    } else if (endpoint === EModelEndpoint.google) {
      if (model) {
        _title += `: ${model}`;
      }
      if (modelLabel) {
        _title += ` as ${modelLabel}`;
      }
    } else if (endpoint === EModelEndpoint.bingAI) {
      if (toneStyle) {
        _title += `: ${toneStyle}`;
      }
      if (jailbreak) {
        _title += ' as Sydney';
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

  return (
    <>
      <div
        onClick={() => handlePresetClick(preset, index)}
        className="flex items-center justify-start rounded border border-gray-750 p-3 dark:hover:bg-gray-800"
      >
        {icon}
        <div>
          <p className="text-lg dark:text-white">{preset?.chatGptLabel}</p>
          <p className="dark:text-gray-300">{getPresetTitle()}</p>
        </div>
      </div>
    </>
  );
}
