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

const showAgentSettings = atom<boolean>({
  key: 'showAgentSettings',
  default: false,
});

const showBingToneSetting = atom<boolean>({
  key: 'showBingToneSetting',
  default: false,
});

export default { optionSettings, showPluginStoreDialog, showAgentSettings, showBingToneSetting };
