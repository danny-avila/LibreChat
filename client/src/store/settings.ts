import { atom } from 'recoil';
import { applyFontSize } from '@librechat/client';
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

const fontSize = atom<string>({
  key: 'fontSize',
  default: 'text-base',
  effects_UNSTABLE: [
    ({ setSelf, onSet, trigger }) => {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        return;
      }

      const hydrate = () => {
        const savedValue = localStorage.getItem('fontSize');

        if (savedValue !== null) {
          try {
            const parsedValue = JSON.parse(savedValue);
            setSelf(parsedValue);
            applyFontSize(parsedValue);
            return;
          } catch (error) {
            console.error(
              'Error parsing localStorage key "fontSize", savedValue: defaultValue, error:',
              error,
            );
            localStorage.setItem('fontSize', JSON.stringify('text-base'));
            setSelf('text-base');
          }
        }

        applyFontSize('text-base');
      };

      if (trigger === 'get') {
        hydrate();
      } else {
        const currentValue = localStorage.getItem('fontSize');
        if (currentValue !== null) {
          try {
            applyFontSize(JSON.parse(currentValue));
          } catch {
            applyFontSize('text-base');
          }
        } else {
          applyFontSize('text-base');
        }
      }

      onSet((newValue) => {
        localStorage.setItem('fontSize', JSON.stringify(newValue));
        applyFontSize(newValue);
      });
    },
  ],
});

const localStorageAtoms = {
  // General settings
  autoScroll: atomWithLocalStorage('autoScroll', false),
  hideSidePanel: atomWithLocalStorage('hideSidePanel', false),
  fontSize,
  enableUserMsgMarkdown: atomWithLocalStorage<boolean>(
    LocalStorageKeys.ENABLE_USER_MSG_MARKDOWN,
    true,
  ),

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
