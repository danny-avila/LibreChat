import { DropdownMenuRadioItem, EditIcon, TrashIcon } from '~/components';
import { getIcon } from '~/components/Endpoints';

export default function PresetItem({ preset = {}, value, onChangePreset, onDeletePreset }) {
  const { endpoint } = preset;

  const icon = getIcon({
    size: 20,
    endpoint: preset?.endpoint,
    model: preset?.model,
    error: false,
    className: 'mr-2',
  });

  const getPresetTitle = () => {
    let _title = `${endpoint}`;

    if (endpoint === 'azureOpenAI' || endpoint === 'openAI') {
      const { chatGptLabel, model } = preset;
      if (model) {
        _title += `: ${model}`;
      }
      if (chatGptLabel) {
        _title += ` as ${chatGptLabel}`;
      }
    } else if (endpoint === 'google') {
      const { modelLabel, model } = preset;
      if (model) {
        _title += `: ${model}`;
      }
      if (modelLabel) {
        _title += ` as ${modelLabel}`;
      }
    } else if (endpoint === 'bingAI') {
      const { jailbreak, toneStyle } = preset;
      if (toneStyle) {
        _title += `: ${toneStyle}`;
      }
      if (jailbreak) {
        _title += ' as Sydney';
      }
    } else if (endpoint === 'chatGPTBrowser') {
      const { model } = preset;
      if (model) {
        _title += `: ${model}`;
      }
    } else if (endpoint === 'gptPlugins') {
      const { model } = preset;
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

  // regular model
  return (
    <DropdownMenuRadioItem
      value={value}
      className="group flex h-10 max-h-[44px] flex-row justify-between dark:font-semibold dark:text-gray-100 dark:hover:bg-gray-800 sm:h-auto"
    >
      <div className="flex items-center justify-start">
        {icon}
        <small className="text-[11px]">{preset?.title}</small>
        <small className="invisible ml-1 flex w-0 flex-shrink text-[10px] sm:visible sm:w-auto">
          ({getPresetTitle()})
        </small>
      </div>
      <div className="flex h-full items-center justify-end">
        <button
          className="m-0 mr-1 h-full rounded-md px-4 text-gray-400 hover:text-gray-700 dark:bg-gray-700 dark:text-gray-400 dark:hover:text-gray-200 sm:invisible sm:p-2 sm:group-hover:visible"
          onClick={(e) => {
            e.preventDefault();
            onChangePreset(preset);
          }}
        >
          <EditIcon />
        </button>
        <button
          className="m-0 h-full rounded-md px-4 text-gray-400 hover:text-gray-700 dark:bg-gray-700 dark:text-gray-400 dark:hover:text-gray-200 sm:invisible sm:p-2 sm:group-hover:visible"
          onClick={(e) => {
            e.preventDefault();
            onDeletePreset(preset);
          }}
        >
          <TrashIcon />
        </button>
      </div>
    </DropdownMenuRadioItem>
  );
}
