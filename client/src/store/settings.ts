import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { SettingsViews, LocalStorageKeys } from 'librechat-data-provider';
import type { TOptionSettings } from '~/common';

// Static atoms without localStorage
const staticAtoms = {
  abortScroll: atom<boolean>(false),
  showFiles: atom<boolean>(false),
  optionSettings: atom<TOptionSettings>({}),
  showPluginStoreDialog: atom<boolean>(false),
  showAgentSettings: atom<boolean>(false),
  currentSettingsView: atom<SettingsViews>(SettingsViews.default),
  showPopover: atom<boolean>(false),
};

const localStorageAtoms = {
  // General settings
  autoScroll: atomWithStorage('autoScroll', false),
  hideSidePanel: atomWithStorage('hideSidePanel', false),
  fontSize: atomWithStorage('fontSize', 'text-base'),
  enableUserMsgMarkdown: atomWithStorage<boolean>(LocalStorageKeys.ENABLE_USER_MSG_MARKDOWN, true),

  // Chat settings
  enterToSend: atomWithStorage('enterToSend', true),
  maximizeChatSpace: atomWithStorage('maximizeChatSpace', false),
  chatDirection: atomWithStorage('chatDirection', 'LTR'),
  showCode: atomWithStorage(LocalStorageKeys.SHOW_ANALYSIS_CODE, true),
  saveDrafts: atomWithStorage('saveDrafts', true),
  showScrollButton: atomWithStorage('showScrollButton', true),
  forkSetting: atomWithStorage('forkSetting', ''),
  splitAtTarget: atomWithStorage('splitAtTarget', false),
  rememberDefaultFork: atomWithStorage(LocalStorageKeys.REMEMBER_FORK_OPTION, false),
  showThinking: atomWithStorage('showThinking', false),
  saveBadgesState: atomWithStorage('saveBadgesState', false),

  // Beta features settings
  modularChat: atomWithStorage('modularChat', true),
  LaTeXParsing: atomWithStorage('LaTeXParsing', true),
  centerFormOnLanding: atomWithStorage('centerFormOnLanding', true),
  showFooter: atomWithStorage('showFooter', true),

  // Commands settings
  atCommand: atomWithStorage('atCommand', true),
  plusCommand: atomWithStorage('plusCommand', true),
  slashCommand: atomWithStorage('slashCommand', true),

  // Speech settings
  conversationMode: atomWithStorage('conversationMode', false),
  advancedMode: atomWithStorage('advancedMode', false),

  speechToText: atomWithStorage('speechToText', true),
  engineSTT: atomWithStorage('engineSTT', 'browser'),
  languageSTT: atomWithStorage('languageSTT', ''),
  autoTranscribeAudio: atomWithStorage('autoTranscribeAudio', false),
  decibelValue: atomWithStorage('decibelValue', -45),
  autoSendText: atomWithStorage('autoSendText', -1),

  textToSpeech: atomWithStorage('textToSpeech', true),
  engineTTS: atomWithStorage('engineTTS', 'browser'),
  voice: atomWithStorage<string | undefined>('voice', undefined),
  cloudBrowserVoices: atomWithStorage('cloudBrowserVoices', false),
  languageTTS: atomWithStorage('languageTTS', ''),
  automaticPlayback: atomWithStorage('automaticPlayback', false),
  playbackRate: atomWithStorage<number | null>('playbackRate', null),
  cacheTTS: atomWithStorage('cacheTTS', true),

  // Account settings
  UsernameDisplay: atomWithStorage('UsernameDisplay', true),
};

export default { ...staticAtoms, ...localStorageAtoms };
