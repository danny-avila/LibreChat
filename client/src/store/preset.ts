import { atom } from 'jotai';
import { atomWithReset } from 'jotai/utils';
import { TPreset } from 'librechat-data-provider';

const defaultPreset = atomWithReset<TPreset | null>(null);

const presetModalVisible = atom<boolean>(false);

export default {
  defaultPreset,
  presetModalVisible,
};
