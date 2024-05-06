import { atom } from 'recoil';
import { TPreset } from 'librechat-data-provider';

const presets = atom<TPreset[]>({
  key: 'presets',
  default: [],
});

const preset = atom<TPreset | null>({
  key: 'preset',
  default: null,
});

const defaultPreset = atom<TPreset | null>({
  key: 'defaultPreset',
  default: null,
});

const presetModalVisible = atom<boolean>({
  key: 'presetModalVisible',
  default: false,
});

export default {
  preset,
  presets,
  defaultPreset,
  presetModalVisible,
};
