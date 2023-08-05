import { atom } from 'recoil';

type TOptionSettings = {
  showExamples?: boolean;
  isCodeChat?: boolean;
};

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

const showPopover = atom<boolean>({
  key: 'showPopover',
  default: false,
});

export default {
  optionSettings,
  showPluginStoreDialog,
  showAgentSettings,
  showBingToneSetting,
  showPopover,
};
