import { atom } from 'recoil';
import { SettingsViews } from 'librechat-data-provider';
import { atomWithLocalStorage } from '~/store/utils';
import type { TOptionSettings } from '~/common';

// Static atoms without localStorage
const staticAtoms = {
  abortScroll: atom<boolean>({ key: 'abortScroll', default: false }),
  showFiles: atom<boolean>({ key: 'showFiles', default: false }),
  optionSettings: atom<TOptionSettings>({ key: 'optionSettings', default: {} }),
  showPluginStoreDialog: atom<boolean>({ key: 'showPluginStoreDialog', default: false }),
  showAgentSettings: atom<boolean>({ key: 'showAgentSettings', default: false }),
  currentSettingsView: atom<SettingsViews>({
    key: 'currentSettingsView',
    default: SettingsViews.default,
  }),
  showBingToneSetting: atom<boolean>({ key: 'showBingToneSetting', default: false }),
  showPopover: atom<boolean>({ key: 'showPopover', default: false }),
};

// Atoms with localStorage
const localStorageAtoms = {
  autoScroll: atomWithLocalStorage('autoScroll', false),
  showCode: atomWithLocalStorage('showCode', false),
  hideSidePanel: atomWithLocalStorage('hideSidePanel', false),
  modularChat: atomWithLocalStorage('modularChat', true),
  LaTeXParsing: atomWithLocalStorage('LaTeXParsing', true),
  UsernameDisplay: atomWithLocalStorage('UsernameDisplay', true),
  TextToSpeech: atomWithLocalStorage('textToSpeech', true),
  automaticPlayback: atomWithLocalStorage('automaticPlayback', false),
  enterToSend: atomWithLocalStorage('enterToSend', true),
  SpeechToText: atomWithLocalStorage('speechToText', true),
  conversationMode: atomWithLocalStorage('conversationMode', false),
  advancedMode: atomWithLocalStorage('advancedMode', false),
  autoSendText: atomWithLocalStorage('autoSendText', false),
  autoTranscribeAudio: atomWithLocalStorage('autoTranscribeAudio', false),
  decibelValue: atomWithLocalStorage('decibelValue', -45),
  endpointSTT: atomWithLocalStorage('endpointSTT', 'browser'),
  endpointTTS: atomWithLocalStorage('endpointTTS', 'browser'),
  cacheTTS: atomWithLocalStorage('cacheTTS', true),
  voice: atomWithLocalStorage('voice', ''),
  forkSetting: atomWithLocalStorage('forkSetting', ''),
  splitAtTarget: atomWithLocalStorage('splitAtTarget', false),
  rememberForkOption: atomWithLocalStorage('rememberForkOption', true),
  playbackRate: atomWithLocalStorage<number | null>('playbackRate', null),
  saveDrafts: atomWithLocalStorage('saveDrafts', false),
};

export default { ...staticAtoms, ...localStorageAtoms };
