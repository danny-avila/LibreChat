import React from 'react';
import PresetItem from './PresetItem';
import type { TPreset } from 'librechat-data-provider';

export default function PresetItems({ presets, onSelect, onChangePreset, onDeletePreset }) {
  return (
    <>
      {presets.map((preset: TPreset) => (
        <PresetItem
          key={preset?.presetId ?? Math.random()}
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
