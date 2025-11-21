import { atom } from 'recoil';
import { SettingsViews, LocalStorageKeys } from 'librechat-data-provider';
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
  showPopover: atom<boolean>({ key: 'showPopover', default: false }),
};

const localStorageAtoms = {
  // General settings
  autoScroll: atomWithLocalStorage('autoScroll', false),
  hideSidePanel: atomWithLocalStorage('hideSidePanel', false),
  enableUserMsgMarkdown: atomWithLocalStorage<boolean>(
    LocalStorageKeys.ENABLE_USER_MSG_MARKDOWN,
    true,
  ),
  keepScreenAwake: atomWithLocalStorage('keepScreenAwake', true),

  // Chat settings
  enterToSend: atomWithLocalStorage('enterToSend', true),
  maximizeChatSpace: atomWithLocalStorage('maximizeChatSpace', false),
  chatDirection: atomWithLocalStorage('chatDirection', 'LTR'),
  showCode: atomWithLocalStorage(LocalStorageKeys.SHOW_ANALYSIS_CODE, true),
  saveDrafts: atomWithLocalStorage('saveDrafts', true),
  showScrollButton: atomWithLocalStorage('showScrollButton', true),
  forkSetting: atomWithLocalStorage('forkSetting', ''),
  splitAtTarget: atomWithLocalStorage('splitAtTarget', false),
  rememberDefaultFork: atomWithLocalStorage(LocalStorageKeys.REMEMBER_FORK_OPTION, false),
  showThinking: atomWithLocalStorage('showThinking', false),
  saveBadgesState: atomWithLocalStorage('saveBadgesState', false),

  // Beta features settings
  modularChat: atomWithLocalStorage('modularChat', true),
  LaTeXParsing: atomWithLocalStorage('LaTeXParsing', true),
  centerFormOnLanding: atomWithLocalStorage('centerFormOnLanding', true),
  showFooter: atomWithLocalStorage('showFooter', true),

  // Commands settings
  atCommand: atomWithLocalStorage('atCommand', true),
  plusCommand: atomWithLocalStorage('plusCommand', true),
  slashCommand: atomWithLocalStorage('slashCommand', true),

  // Speech settings
  conversationMode: atomWithLocalStorage('conversationMode', false),
  advancedMode: atomWithLocalStorage('advancedMode', false),

  speechToText: atomWithLocalStorage('speechToText', true),
  engineSTT: atomWithLocalStorage('engineSTT', 'browser'),
  languageSTT: atomWithLocalStorage('languageSTT', ''),
  autoTranscribeAudio: atomWithLocalStorage('autoTranscribeAudio', false),
  decibelValue: atomWithLocalStorage('decibelValue', -45),
  autoSendText: atomWithLocalStorage('autoSendText', -1),

  textToSpeech: atomWithLocalStorage('textToSpeech', true),
  engineTTS: atomWithLocalStorage('engineTTS', 'browser'),
  voice: atomWithLocalStorage<string | undefined>('voice', undefined),
  cloudBrowserVoices: atomWithLocalStorage('cloudBrowserVoices', false),
  languageTTS: atomWithLocalStorage('languageTTS', ''),
  automaticPlayback: atomWithLocalStorage('automaticPlayback', false),
  playbackRate: atomWithLocalStorage<number | null>('playbackRate', null),
  cacheTTS: atomWithLocalStorage('cacheTTS', true),

  // Account settings
  UsernameDisplay: atomWithLocalStorage('UsernameDisplay', true),
};

export default { ...staticAtoms, ...localStorageAtoms };
