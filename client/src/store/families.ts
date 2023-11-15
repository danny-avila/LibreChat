import {
  atom,
  atomFamily,
  selector,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from 'recoil';
import type { TMessage, TPreset, TConversation, TSubmission } from 'librechat-data-provider';
import type { TOptionSettings } from '~/common';
import { useEffect } from 'react';

const conversationByIndex = atomFamily<TConversation | null, string | number>({
  key: 'conversationByIndex',
  default: null,
});

const conversationKeysAtom = atom<(string | number)[]>({
  key: 'conversationKeys',
  default: [],
});

const allConversationsSelector = selector({
  key: 'allConversationsSelector',
  get: ({ get }) => {
    const keys = get(conversationKeysAtom);
    return keys.map((key) => get(conversationByIndex(key))).map((convo) => convo?.conversationId);
  },
});

const presetByIndex = atomFamily<TPreset | null, string | number>({
  key: 'presetByIndex',
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
  key: 'isSubmittingByIndex',
  default: false,
});

const optionSettingsFamily = atomFamily<TOptionSettings, string | number>({
  key: 'optionSettingsByIndex',
  default: {},
});

const showAgentSettingsFamily = atomFamily({
  key: 'showAgentSettingsByIndex',
  default: false,
});

const showBingToneSettingFamily = atomFamily({
  key: 'showBingToneSettingByIndex',
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

const textareaHeightFamily = atomFamily<number, string | number>({
  key: 'textareaHeightByIndex',
  default: 56,
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

function useCreateConversationAtom(key: string | number) {
  const [keys, setKeys] = useRecoilState(conversationKeysAtom);
  const setConversation = useSetRecoilState(conversationByIndex(key));
  const conversation = useRecoilValue(conversationByIndex(key));

  useEffect(() => {
    if (!keys.includes(key)) {
      setKeys([...keys, key]);
    }
  }, [key, keys, setKeys]);

  return { conversation, setConversation };
}

export default {
  conversationByIndex,
  presetByIndex,
  submissionByIndex,
  textByIndex,
  abortScrollFamily,
  isSubmittingFamily,
  optionSettingsFamily,
  showAgentSettingsFamily,
  showBingToneSettingFamily,
  showPopoverFamily,
  autoScrollFamily,
  latestMessageFamily,
  textareaHeightFamily,
  allConversationsSelector,
  useCreateConversationAtom,
};
