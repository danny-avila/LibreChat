import { atom } from 'recoil';
import { SettingsViews } from 'librechat-data-provider';
import type { TOptionSettings } from '~/common';

// Helper function to create atoms with localStorage
function atomWithLocalStorage<T>(key: string, defaultValue: T) {
  return atom<T>({
    key,
    default: localStorage.getItem(key) ? JSON.parse(localStorage.getItem(key)!) : defaultValue,
    effects_UNSTABLE: [
      ({ setSelf, onSet }) => {
        const savedValue = localStorage.getItem(key);
        if (savedValue != null) {
          setSelf(JSON.parse(savedValue));
        }

        onSet((newValue: T) => {
          localStorage.setItem(key, JSON.stringify(newValue));
        });
      },
    ],
  });
}

const abortScroll = atom<boolean>({ key: 'abortScroll', default: false });
const showFiles = atom<boolean>({ key: 'showFiles', default: false });
const optionSettings = atom<TOptionSettings>({ key: 'optionSettings', default: {} });
const showPluginStoreDialog = atom<boolean>({ key: 'showPluginStoreDialog', default: false });
const showAgentSettings = atom<boolean>({ key: 'showAgentSettings', default: false });
const currentSettingsView = atom<SettingsViews>({
  key: 'currentSettingsView',
  default: SettingsViews.default,
});
const showBingToneSetting = atom<boolean>({ key: 'showBingToneSetting', default: false });
const showPopover = atom<boolean>({ key: 'showPopover', default: false });

// Atoms with localStorage
const autoScroll = atomWithLocalStorage('autoScroll', false);
const showCode = atomWithLocalStorage('showCode', false);
const hideSidePanel = atomWithLocalStorage('hideSidePanel', false);
const modularChat = atomWithLocalStorage('modularChat', false);
const LaTeXParsing = atomWithLocalStorage('LaTeXParsing', true);
const UsernameDisplay = atomWithLocalStorage('UsernameDisplay', true);
const TextToSpeech = atomWithLocalStorage('TextToSpeech', true);
const enterToSend = atomWithLocalStorage('enterToSend', true);
const SpeechToText = atomWithLocalStorage('SpeechToText', true);
const conversationMode = atomWithLocalStorage('conversationMode', false);
const advancedMode = atomWithLocalStorage('advancedMode', false);
const autoSendText = atomWithLocalStorage('autoSendText', false);
const autoTranscribeAudio = atomWithLocalStorage('autoTranscribeAudio', false);
const decibelValue = atomWithLocalStorage('decibelValue', -45);
const endpointSTT = atomWithLocalStorage('endpointSTT', 'browser');
const endpointTTS = atomWithLocalStorage('endpointTTS', 'browser');

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
  TextToSpeech,
  SpeechToText,
  conversationMode,
  advancedMode,
  autoSendText,
  autoTranscribeAudio,
  decibelValue,
  endpointSTT,
  endpointTTS,
};
