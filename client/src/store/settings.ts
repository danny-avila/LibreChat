import { atom } from 'recoil';
import { SettingsViews, LocalStorageKeys } from 'librechat-data-provider';
import type { TOptionSettings } from '~/common';
import { atomWithLocalStorage } from '~/store/utils';

// Static atoms without localStorage
const staticAtoms = {
  abortScroll: atom<boolean>({ key: 'abortScroll', default: false }),
  optionSettings: atom<TOptionSettings>({ key: 'optionSettings', default: {} }),
  currentSettingsView: atom<SettingsViews>({
    key: 'currentSettingsView',
    default: SettingsViews.default,
  }),
  showPopover: atom<boolean>({ key: 'showPopover', default: false }),
};

const localStorageAtoms = {
  // General settings
  autoScroll: atomWithLocalStorage('autoScroll', false),
  sidebarExpanded: atomWithLocalStorage(
    'unifiedSidebarExpanded',
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches ? false : true,
  ),
  enableUserMsgMarkdown: atomWithLocalStorage<boolean>(
    LocalStorageKeys.ENABLE_USER_MSG_MARKDOWN,
    true,
  ),
  keepScreenAwake: atomWithLocalStorage('keepScreenAwake', true),
  newChatSwitchToHistory: atomWithLocalStorage('newChatSwitchToHistory', true),

  // Chat settings
  enterToSend: atomWithLocalStorage('enterToSend', true),
  /** What Enter does while a reply is generating. Queue by default: injecting
   *  into a reply the user is still reading is the surprising choice, so it is
   *  the opt-in one. */
  duringRunDefaultAction: atomWithLocalStorage<'steer' | 'queue'>(
    'duringRunDefaultAction',
    'queue',
  ),
  /**
   * Whether a steer interrupts generation at the next safe boundary instead of
   * waiting for the run's next tool step. Orthogonal to
   * `duringRunDefaultAction`: that chooses steer-vs-queue, this chooses how
   * soon a steer lands. The composer's interrupt button always interrupts
   * regardless — this only governs the default Enter/steer route.
   */
  steerInterruptsByDefault: atomWithLocalStorage('steerInterruptsByDefault', false),
  maximizeChatSpace: atomWithLocalStorage('maximizeChatSpace', false),
  chatDirection: atomWithLocalStorage('chatDirection', 'LTR'),
  autoExpandTools: atomWithLocalStorage(LocalStorageKeys.AUTO_EXPAND_TOOLS, false),
  saveDrafts: atomWithLocalStorage('saveDrafts', true),
  showScrollButton: atomWithLocalStorage('showScrollButton', true),
  forkSetting: atomWithLocalStorage('forkSetting', ''),
  splitAtTarget: atomWithLocalStorage('splitAtTarget', false),
  rememberDefaultFork: atomWithLocalStorage(LocalStorageKeys.REMEMBER_FORK_OPTION, false),
  saveBadgesState: atomWithLocalStorage('saveBadgesState', false),

  // Beta features settings
  modularChat: atomWithLocalStorage('modularChat', true),
  LaTeXParsing: atomWithLocalStorage('LaTeXParsing', true),
  centerFormOnLanding: atomWithLocalStorage('centerFormOnLanding', true),
  /** The line of keyboard hints under the composer. Off by default: it is
   *  discovery copy, and the shortcuts it names stay available either way. */
  showComposerTips: atomWithLocalStorage('showComposerTips', false),
  showFooter: atomWithLocalStorage('showFooter', true),

  // Commands settings
  atCommand: atomWithLocalStorage('atCommand', true),
  plusCommand: atomWithLocalStorage('plusCommand', true),
  slashCommand: atomWithLocalStorage('slashCommand', true),
  dollarCommand: atomWithLocalStorage('dollarCommand', true),

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
