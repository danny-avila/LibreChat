import { atom } from 'recoil';
import { TPreset } from 'vestai-data-provider';

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
