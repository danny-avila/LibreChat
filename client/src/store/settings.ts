import { atom } from 'recoil';
import { SettingsViews, LocalStorageKeys } from 'librechat-data-provider';
import type { TOptionSettings } from '~/common';

const abortScroll = atom<boolean>({
  key: 'abortScroll',
  default: false,
});

const showFiles = atom<boolean>({
  key: 'showFiles',
  default: false,
});

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

const currentSettingsView = atom<SettingsViews>({
  key: 'currentSettingsView',
  default: SettingsViews.default,
});

const showBingToneSetting = atom<boolean>({
  key: 'showBingToneSetting',
  default: false,
});

const showPopover = atom<boolean>({
  key: 'showPopover',
  default: false,
});

const autoScroll = atom<boolean>({
  key: 'autoScroll',
  default: localStorage.getItem('autoScroll') === 'true',
  effects: [
    ({ setSelf, onSet }) => {
      const savedValue = localStorage.getItem('autoScroll');
      if (savedValue != null) {
        setSelf(savedValue === 'true');
      }

      onSet((newValue: unknown) => {
        if (typeof newValue === 'boolean') {
          localStorage.setItem('autoScroll', newValue.toString());
        }
      });
    },
  ] as const,
});

const showCode = atom<boolean>({
  key: 'showCode',
  default: localStorage.getItem('showCode') === 'true',
  effects: [
    ({ setSelf, onSet }) => {
      const savedValue = localStorage.getItem('showCode');
      if (savedValue != null) {
        setSelf(savedValue === 'true');
      }

      onSet((newValue: unknown) => {
        if (typeof newValue === 'boolean') {
          localStorage.setItem('showCode', newValue.toString());
        }
      });
    },
  ] as const,
});

const hideSidePanel = atom<boolean>({
  key: 'hideSidePanel',
  default: localStorage.getItem('hideSidePanel') === 'true',
  effects: [
    ({ setSelf, onSet }) => {
      const savedValue = localStorage.getItem('hideSidePanel');
      if (savedValue != null) {
        setSelf(savedValue === 'true');
      }

      onSet((newValue: unknown) => {
        if (typeof newValue === 'boolean') {
          localStorage.setItem('hideSidePanel', newValue.toString());
        }
      });
    },
  ] as const,
});

const modularChat = atom<boolean>({
  key: 'modularChat',
  default: true,
  effects: [
    ({ setSelf, onSet }) => {
      const savedValue = localStorage.getItem('modularChat');
      if (savedValue != null) {
        setSelf(savedValue === 'true');
      }

      onSet((newValue: unknown) => {
        if (typeof newValue === 'boolean') {
          localStorage.setItem('modularChat', newValue.toString());
        }
      });
    },
  ] as const,
});

const LaTeXParsing = atom<boolean>({
  key: 'LaTeXParsing',
  default: true,
  effects: [
    ({ setSelf, onSet }) => {
      const savedValue = localStorage.getItem('LaTeXParsing');
      if (savedValue != null) {
        setSelf(savedValue === 'true');
      }

      onSet((newValue: unknown) => {
        if (typeof newValue === 'boolean') {
          localStorage.setItem('LaTeXParsing', newValue.toString());
        }
      });
    },
  ] as const,
});

const forkSetting = atom<string>({
  key: LocalStorageKeys.FORK_SETTING,
  default: '',
  effects: [
    ({ setSelf, onSet }) => {
      const savedValue = localStorage.getItem(LocalStorageKeys.FORK_SETTING);
      if (savedValue != null) {
        setSelf(savedValue);
      }

      onSet((newValue: unknown) => {
        if (typeof newValue === 'string') {
          localStorage.setItem(LocalStorageKeys.FORK_SETTING, newValue.toString());
        }
      });
    },
  ] as const,
});

const rememberForkOption = atom<boolean>({
  key: LocalStorageKeys.REMEMBER_FORK_OPTION,
  default: false,
  effects: [
    ({ setSelf, onSet }) => {
      const savedValue = localStorage.getItem(LocalStorageKeys.REMEMBER_FORK_OPTION);
      if (savedValue != null) {
        setSelf(savedValue === 'true');
      }

      onSet((newValue: unknown) => {
        if (typeof newValue === 'boolean') {
          localStorage.setItem(LocalStorageKeys.REMEMBER_FORK_OPTION, newValue.toString());
        }
      });
    },
  ] as const,
});

const splitAtTarget = atom<boolean>({
  key: LocalStorageKeys.FORK_SPLIT_AT_TARGET,
  default: false,
  effects: [
    ({ setSelf, onSet }) => {
      const savedValue = localStorage.getItem(LocalStorageKeys.FORK_SPLIT_AT_TARGET);
      if (savedValue != null) {
        setSelf(savedValue === 'true');
      }

      onSet((newValue: unknown) => {
        if (typeof newValue === 'boolean') {
          localStorage.setItem(LocalStorageKeys.FORK_SPLIT_AT_TARGET, newValue.toString());
        }
      });
    },
  ] as const,
});

const UsernameDisplay = atom<boolean>({
  key: 'UsernameDisplay',
  default: localStorage.getItem('UsernameDisplay') === 'true',
  effects: [
    ({ setSelf, onSet }) => {
      const savedValue = localStorage.getItem('UsernameDisplay');
      if (savedValue != null) {
        setSelf(savedValue === 'true');
      }

      onSet((newValue: unknown) => {
        if (typeof newValue === 'boolean') {
          localStorage.setItem('UsernameDisplay', newValue.toString());
        }
      });
    },
  ] as const,
});

const enterToSend = atom<boolean>({
  key: 'enterToSend',
  default: true,
  effects: [
    ({ setSelf, onSet }) => {
      const savedValue = localStorage.getItem('enterToSend');
      if (savedValue != null) {
        setSelf(savedValue === 'true');
      }

      onSet((newValue: unknown) => {
        if (typeof newValue === 'boolean') {
          localStorage.setItem('enterToSend', newValue.toString());
        }
      });
    },
  ] as const,
});

export default {
  abortScroll,
  showFiles,
  optionSettings,
  showPluginStoreDialog,
  showAgentSettings,
  currentSettingsView,
  showBingToneSetting,
  showPopover,
  autoScroll,
  enterToSend,
  showCode,
  hideSidePanel,
  modularChat,
  LaTeXParsing,
  UsernameDisplay,
  forkSetting,
  splitAtTarget,
  rememberForkOption,
};
