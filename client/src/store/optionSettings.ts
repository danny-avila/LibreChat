import { atom } from 'recoil';
import { TOptionSettings } from 'librechat-data-provider';

const optionSettings = atom<TOptionSettings>({
  key: 'optionSettings',
  default: {},
});

export default { optionSettings };
