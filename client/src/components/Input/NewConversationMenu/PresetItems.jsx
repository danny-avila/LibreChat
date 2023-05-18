import React from 'react';
import PresetItem from './PresetItem.jsx';

export default function PresetItems({ presets, onSelect, onChangePreset, onDeletePreset }) {
  return (
    <>
      {presets.map((preset) => (
        <PresetItem
          key={preset?.presetId}
          value={preset}
          onSelect={onSelect}
          onChangePreset={onChangePreset}
          onDeletePreset={onDeletePreset}
          preset={preset}
        />
      ))}
    </>
  );
}
