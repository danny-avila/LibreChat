import React from 'react';
import { DropdownMenuRadioItem } from '../../ui/DropdownMenu.tsx';
import EditIcon from '../../svg/EditIcon';
import TrashIcon from '../../svg/TrashIcon';
import getIcon from '~/utils/getIcon';

export default function PresetItem({ preset = {}, value, onSelect, onChangePreset, onDeletePreset }) {
  const { endpoint } = preset;

  const icon = getIcon({
    size: 20,
    endpoint: preset?.endpoint,
    error: false,
    className: 'mr-2'
  });

  const getPresetTitle = () => {
    let _title = `${endpoint}`;

    if (endpoint === 'azureOpenAI' || endpoint === 'openAI') {
      const { chatGptLabel, model } = preset;
      if (model) _title += `: ${model}`;
      if (chatGptLabel) _title += ` as ${chatGptLabel}`;
    } else if (endpoint === 'bingAI') {
      const { jailbreak, toneStyle } = preset;
      if (toneStyle) _title += `: ${toneStyle}`;
      if (jailbreak) _title += ` as Sydney`;
    } else if (endpoint === 'chatGPTBrowser') {
      const { model } = preset;
      if (model) _title += `: ${model}`;
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
      className="group dark:font-semibold dark:text-gray-100 dark:hover:bg-gray-800"
    >
      {icon}
      {preset?.title}
      <small className="ml-2">({getPresetTitle()})</small>

      {/* <RenameButton
        twcss={`ml-auto mr-2 ${buttonClass.className}`}
        onRename={onRename}
        renaming={renaming}
        onMouseOver={handleMouseOver}
        onMouseOut={handleMouseOut}
        renameHandler={renameHandler}
      /> */}
      <div className="flex w-4 flex-1" />
      <button
        className="invisible m-0 mr-1 rounded-md text-gray-400 hover:text-gray-700 group-hover:visible dark:text-gray-400 dark:hover:text-gray-200        "
        onClick={e => {
          e.preventDefault();
          onDeletePreset(preset);
        }}
      >
        <TrashIcon />
      </button>
      <button
        className="invisible m-0 p-2 rounded-md text-gray-400 hover:text-gray-700 group-hover:visible dark:text-gray-400 dark:hover:text-gray-200        "
        onClick={e => {
          e.preventDefault();
          onChangePreset(preset);
        }}
      >
        <EditIcon />
      </button>
    </DropdownMenuRadioItem>
  );
}
