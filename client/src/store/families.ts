import { atomFamily } from 'recoil';
import type { TMessage, TConversation, TSubmission } from 'librechat-data-provider';

const conversationByIndex = atomFamily<TConversation | null, string | number>({
  key: 'conversationByIndex',
  default: null,
});

const submissionByIndex = atomFamily<TSubmission | null, string | number>({
  key: 'submissionByIndex',
  default: null,
});

const textByIndex = atomFamily<string, string | number>({
  key: 'textByIndex',
  default: '',
});

const abortScrollFamily = atomFamily({
  key: 'abortScrollByIndex',
  default: false,
});

const isSubmittingFamily = atomFamily({
  key: 'isSubmittingById',
  default: false,
});

const showAgentSettingsFamily = atomFamily({
  key: 'showAgentSettingsById',
  default: false,
});

const showBingToneSettingFamily = atomFamily({
  key: 'showBingToneSettingById',
  default: false,
});

const showPopoverFamily = atomFamily({
  key: 'showPopoverByIndex',
  default: false,
});

const latestMessageFamily = atomFamily<TMessage | null, string | number | null>({
  key: 'latestMessageByIndex',
  default: null,
});

const autoScrollFamily = atomFamily({
  key: 'autoScrollByIndex',
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

export default {
  textByIndex,
  submissionByIndex,
  conversationByIndex,
  abortScrollFamily,
  isSubmittingFamily,
  showAgentSettingsFamily,
  showBingToneSettingFamily,
  showPopoverFamily,
  autoScrollFamily,
  latestMessageFamily,
};
