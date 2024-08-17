import {
  atom,
  selector,
  atomFamily,
  selectorFamily,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
  useRecoilCallback,
} from 'recoil';
import { LocalStorageKeys, Constants } from 'librechat-data-provider';
import type { TMessage, TPreset, TConversation, TSubmission } from 'librechat-data-provider';
import type { TOptionSettings, ExtendedFile } from '~/common';
import { storeEndpointSettings, logger } from '~/utils';
import { useEffect } from 'react';

const latestMessageKeysAtom = atom<(string | number)[]>({
  key: 'latestMessageKeys',
  default: [],
});

const submissionKeysAtom = atom<(string | number)[]>({
  key: 'submissionKeys',
  default: [],
});

const latestMessageFamily = atomFamily<TMessage | null, string | number | null>({
  key: 'latestMessageByIndex',
  default: null,
  effects: [
    ({ onSet, node }) => {
      onSet(async (newValue) => {
        const key = Number(node.key.split(Constants.COMMON_DIVIDER)[1]);
        logger.log('Recoil Effect: Setting latestMessage', { key, newValue });
      });
    },
  ] as const,
});

const submissionByIndex = atomFamily<TSubmission | null, string | number>({
  key: 'submissionByIndex',
  default: null,
});

const latestMessageKeysSelector = selector<(string | number)[]>({
  key: 'latestMessageKeysSelector',
  get: ({ get }) => {
    const keys = get(conversationKeysAtom);
    return keys.filter((key) => get(latestMessageFamily(key)) !== null);
  },
  set: ({ set }, newKeys) => {
    logger.log('setting latestMessageKeys', { newKeys });
    set(latestMessageKeysAtom, newKeys);
  },
});

const submissionKeysSelector = selector<(string | number)[]>({
  key: 'submissionKeysSelector',
  get: ({ get }) => {
    const keys = get(conversationKeysAtom);
    return keys.filter((key) => get(submissionByIndex(key)) !== null);
  },
  set: ({ set }, newKeys) => {
    logger.log('setting submissionKeysAtom', newKeys);
    set(submissionKeysAtom, newKeys);
  },
});

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
        localStorage.setItem(
          `${LocalStorageKeys.LAST_CONVO_SETUP}_${index}`,
          JSON.stringify(newValue),
        );
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

const activePromptByIndex = atomFamily<string | undefined, string | number | null>({
  key: 'activePromptByIndex',
  default: undefined,
});

const showMentionPopoverFamily = atomFamily<boolean, string | number | null>({
  key: 'showMentionPopoverByIndex',
  default: false,
});

const showPlusPopoverFamily = atomFamily<boolean, string | number | null>({
  key: 'showPlusPopoverByIndex',
  default: false,
});

const showPromptsPopoverFamily = atomFamily<boolean, string | number | null>({
  key: 'showPromptsPopoverByIndex',
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

const isStreamingAudio = atom<boolean>({
  key: 'isStreamingAudio',
  default: false,
});

const isAudioDetected = atom<boolean>({
  key: 'isAudioDetected',
  default: false,
});

const showCallOverlay = atom<boolean>({
  key: 'showCallOverlay',
  default: false,
});

const streamAudioActiveState = atom<boolean>({
  key: 'streamAudioActiveState',
  default: false,
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
  /** Clears all active conversations. Pass `true` to skip the first or root conversation */
  const clearAllConversations = useRecoilCallback(
    ({ reset, snapshot }) =>
      async (skipFirst?: boolean) => {
        const conversationKeys = await snapshot.getPromise(conversationKeysAtom);

        for (const conversationKey of conversationKeys) {
          if (skipFirst && conversationKey == 0) {
            continue;
          }

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

const conversationByKeySelector = selectorFamily({
  key: 'conversationByKeySelector',
  get:
    (index: string | number) =>
      ({ get }) => {
        const conversation = get(conversationByIndex(index));
        return conversation;
      },
});

function useClearSubmissionState() {
  const clearAllSubmissions = useRecoilCallback(
    ({ reset, set, snapshot }) =>
      async (skipFirst?: boolean) => {
        const submissionKeys = await snapshot.getPromise(submissionKeysSelector);
        logger.log('submissionKeys', submissionKeys);

        for (const key of submissionKeys) {
          if (skipFirst && key == 0) {
            continue;
          }

          logger.log('resetting submission', key);
          reset(submissionByIndex(key));
        }

        set(submissionKeysSelector, []);
      },
    [],
  );

  return clearAllSubmissions;
}

function useClearLatestMessages(context?: string) {
  const clearAllLatestMessages = useRecoilCallback(
    ({ reset, set, snapshot }) =>
      async (skipFirst?: boolean) => {
        const latestMessageKeys = await snapshot.getPromise(latestMessageKeysSelector);
        logger.log('[clearAllLatestMessages] latestMessageKeys', latestMessageKeys);
        if (context) {
          logger.log(`[clearAllLatestMessages] context: ${context}`);
        }

        for (const key of latestMessageKeys) {
          if (skipFirst && key == 0) {
            continue;
          }

          logger.log(`[clearAllLatestMessages] resetting latest message; key: ${key}`);
          reset(latestMessageFamily(key));
        }

        set(latestMessageKeysSelector, []);
      },
    [],
  );

  return clearAllLatestMessages;
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
  conversationByKeySelector,
  useClearConvoState,
  useCreateConversationAtom,
  showMentionPopoverFamily,
  globalAudioURLFamily,
  activeRunFamily,
  audioRunFamily,
  globalAudioPlayingFamily,
  globalAudioFetchingFamily,
  showPlusPopoverFamily,
  activePromptByIndex,
  useClearSubmissionState,
  useClearLatestMessages,
  showPromptsPopoverFamily,
  isStreamingAudio,
  streamAudioActiveState,
  isAudioDetected,
  showCallOverlay,
};
