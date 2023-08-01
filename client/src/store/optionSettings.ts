import { atom } from 'recoil';
import { TOptionSettings } from 'librechat-data-provider';

const optionSettings = atom<TOptionSettings>({
  key: 'optionSettings',
  default: {},
});

const showPluginStoreDialog = atom<boolean>({
  key: 'showPluginStoreDialog',
  default: false,
});

const showBingToneSetting = atom<boolean>({
  key: 'showBingToneSetting',
  default: false,
});

export default { optionSettings, showPluginStoreDialog, showBingToneSetting };
