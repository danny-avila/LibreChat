import {
  atom,
  atomFamily,
  selector,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from 'recoil';
import type { TMessage, TPreset, TConversation, TSubmission } from 'librechat-data-provider';
import type { TOptionSettings, ExtendedFile } from '~/common';
import { useEffect } from 'react';

const conversationByIndex = atomFamily<TConversation | null, string | number>({
  key: 'conversationByIndex',
  default: null,
});

const filesByIndex = atomFamily<Map<string, ExtendedFile>, string | number>({
  key: 'filesByIndex',
  default: new Map(),
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
  filesByIndex,
  presetByIndex,
  submissionByIndex,
  textByIndex,
  abortScrollFamily,
  isSubmittingFamily,
  optionSettingsFamily,
  showAgentSettingsFamily,
  showBingToneSettingFamily,
  showPopoverFamily,
  latestMessageFamily,
  allConversationsSelector,
  useCreateConversationAtom,
};
