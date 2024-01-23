import { atom } from 'recoil';
import type { TOptionSettings } from '~/common';

const abortScroll = atom<boolean>({
  key: 'abortScroll',
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

const modularChat = atom<boolean>({
  key: 'modularChat',
  default: localStorage.getItem('modularChat') === 'true',
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

export default {
  abortScroll,
  optionSettings,
  showPluginStoreDialog,
  showAgentSettings,
  showBingToneSetting,
  showPopover,
  autoScroll,
  modularChat,
  LaTeXParsing,
  UsernameDisplay,
};
