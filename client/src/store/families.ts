import {
  atom,
  atomFamily,
  selector,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
  useRecoilCallback,
} from 'recoil';
import { LocalStorageKeys } from 'librechat-data-provider';
import type { TMessage, TPreset, TConversation, TSubmission } from 'librechat-data-provider';
import type { TOptionSettings, ExtendedFile } from '~/common';
import { storeEndpointSettings } from '~/utils';
import { useEffect } from 'react';

const conversationByIndex = atomFamily<TConversation | null, string | number>({
  key: 'conversationByIndex',
  default: null,
  effects: [
    ({ onSet, node }) => {
      onSet(async (newValue) => {
        const index = Number(node.key.split('__')[1]);
        if (newValue?.assistant_id) {
          localStorage.setItem(
            `${LocalStorageKeys.ASST_ID_PREFIX}${index}${newValue?.endpoint}`,
            newValue.assistant_id,
          );
        }
        if (newValue?.spec) {
          localStorage.setItem(LocalStorageKeys.LAST_SPEC, newValue.spec);
        }
        if (newValue?.tools && Array.isArray(newValue.tools)) {
          localStorage.setItem(
            LocalStorageKeys.LAST_TOOLS,
            JSON.stringify(newValue.tools.filter((el) => !!el)),
          );
        }

        if (!newValue) {
          return;
        }

        storeEndpointSettings(newValue);
        localStorage.setItem(LocalStorageKeys.LAST_CONVO_SETUP, JSON.stringify(newValue));
      });
    },
  ] as const,
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

const showStopButtonByIndex = atomFamily<boolean, string | number>({
  key: 'showStopButtonByIndex',
  default: false,
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

const showMentionPopoverFamily = atomFamily<boolean, string | number | null>({
  key: 'showMentionPopoverByIndex',
  default: false,
});

const globalAudioURLFamily = atomFamily<string | null, string | number | null>({
  key: 'globalAudioURLByIndex',
  default: null,
});

const globalAudioFetchingFamily = atomFamily<boolean, string | number | null>({
  key: 'globalAudioisFetchingByIndex',
  default: false,
});

const globalAudioPlayingFamily = atomFamily<boolean, string | number | null>({
  key: 'globalAudioisPlayingByIndex',
  default: false,
});

const activeRunFamily = atomFamily<string | null, string | number | null>({
  key: 'activeRunByIndex',
  default: null,
});

const audioRunFamily = atomFamily<string | null, string | number | null>({
  key: 'audioRunByIndex',
  default: null,
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

function useClearConvoState() {
  const clearAllConversations = useRecoilCallback(
    ({ reset, snapshot }) =>
      async () => {
        const conversationKeys = await snapshot.getPromise(conversationKeysAtom);

        for (const conversationKey of conversationKeys) {
          reset(conversationByIndex(conversationKey));

          const conversation = await snapshot.getPromise(conversationByIndex(conversationKey));
          if (conversation) {
            reset(latestMessageFamily(conversationKey));
          }
        }

        reset(conversationKeysAtom);
      },
    [],
  );

  return clearAllConversations;
}

export default {
  conversationByIndex,
  filesByIndex,
  presetByIndex,
  submissionByIndex,
  textByIndex,
  showStopButtonByIndex,
  abortScrollFamily,
  isSubmittingFamily,
  optionSettingsFamily,
  showAgentSettingsFamily,
  showBingToneSettingFamily,
  showPopoverFamily,
  latestMessageFamily,
  allConversationsSelector,
  useClearConvoState,
  useCreateConversationAtom,
  showMentionPopoverFamily,
  globalAudioURLFamily,
  activeRunFamily,
  audioRunFamily,
  globalAudioPlayingFamily,
  globalAudioFetchingFamily,
};
