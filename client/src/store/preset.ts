import { TPreset } from 'librechat-data-provider';
import { atom } from 'recoil';

const defaultPreset = atom<TPreset | null>({
  key: 'defaultPreset',
  default: null,
});

const presetModalVisible = atom<boolean>({
  key: 'presetModalVisible',
  default: false,
});

export default {
  defaultPreset,
  presetModalVisible,
};
