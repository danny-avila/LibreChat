import { useEffect } from 'react';
import {
  atom,
  selector,
  atomFamily,
  DefaultValue,
  selectorFamily,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
  useRecoilCallback,
} from 'recoil';
import { LocalStorageKeys, Constants } from 'librechat-data-provider';
import type { TMessage, TPreset, TConversation, TSubmission } from 'librechat-data-provider';
import type { TOptionSettings, ExtendedFile } from '~/common';
import { useSetConvoContext } from '~/Providers/SetConvoContext';
import { storeEndpointSettings, logger, createChatSearchParams } from '~/utils';
import { createSearchParams } from 'react-router-dom';

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
      onSet(async (newValue, oldValue) => {
        const index = Number(node.key.split('__')[1]);
        logger.log('conversation', 'Setting conversation:', { index, newValue, oldValue });
        if (newValue?.assistant_id != null && newValue.assistant_id) {
          localStorage.setItem(
            `${LocalStorageKeys.ASST_ID_PREFIX}${index}${newValue.endpoint}`,
            newValue.assistant_id,
          );
        }
        if (newValue?.agent_id != null && newValue.agent_id) {
          localStorage.setItem(`${LocalStorageKeys.AGENT_ID_PREFIX}${index}`, newValue.agent_id);
        }
        if (newValue?.spec != null && newValue.spec) {
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

        const disableParams = newValue.disableParams === true;
        const shouldUpdateParams =
          index === 0 &&
          !disableParams &&
          newValue.createdAt === '' &&
          JSON.stringify(newValue) !== JSON.stringify(oldValue) &&
          (oldValue as TConversation)?.conversationId === Constants.NEW_CONVO;

        if (shouldUpdateParams) {
          const newParams = createChatSearchParams(newValue);
          const searchParams = createSearchParams(newParams);
          const url = `${window.location.pathname}?${searchParams.toString()}`;
          window.history.pushState({}, '', url);
        }
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

const abortScrollFamily = atomFamily<boolean, string | number>({
  key: 'abortScrollByIndex',
  default: false,
  effects: [
    ({ onSet, node }) => {
      onSet(async (newValue) => {
        const key = Number(node.key.split(Constants.COMMON_DIVIDER)[1]);
        logger.log('message_scrolling', 'Recoil Effect: Setting abortScrollByIndex', {
          key,
          newValue,
        });
      });
    },
  ] as const,
});

const isSubmittingFamily = atomFamily({
  key: 'isSubmittingByIndex',
  default: false,
  effects: [
    ({ onSet, node }) => {
      onSet(async (newValue) => {
        const key = Number(node.key.split(Constants.COMMON_DIVIDER)[1]);
        logger.log('message_stream', 'Recoil Effect: Setting isSubmittingByIndex', {
          key,
          newValue,
        });
      });
    },
  ],
});

const anySubmittingSelector = selector<boolean>({
  key: 'anySubmittingSelector',
  get: ({ get }) => {
    const keys = get(conversationKeysAtom);
    return keys.some((key) => get(isSubmittingFamily(key)) === true);
  },
});

const optionSettingsFamily = atomFamily<TOptionSettings, string | number>({
  key: 'optionSettingsByIndex',
  default: {},
});

const showAgentSettingsFamily = atomFamily({
  key: 'showAgentSettingsByIndex',
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

const messagesSiblingIdxFamily = atomFamily<number, string | null | undefined>({
  key: 'messagesSiblingIdx',
  default: 0,
});

function useCreateConversationAtom(key: string | number) {
  const hasSetConversation = useSetConvoContext();
  const [keys, setKeys] = useRecoilState(conversationKeysAtom);
  const setConversation = useSetRecoilState(conversationByIndex(key));
  const conversation = useRecoilValue(conversationByIndex(key));

  useEffect(() => {
    if (!keys.includes(key)) {
      setKeys([...keys, key]);
    }
  }, [key, keys, setKeys]);

  return { hasSetConversation, conversation, setConversation };
}

function useClearConvoState() {
  /** Clears all active conversations. Pass `true` to skip the first or root conversation */
  const clearAllConversations = useRecoilCallback(
    ({ reset, snapshot }) =>
      async (skipFirst?: boolean) => {
        const conversationKeys = await snapshot.getPromise(conversationKeysAtom);

        for (const conversationKey of conversationKeys) {
          if (skipFirst === true && conversationKey == 0) {
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
          if (skipFirst === true && key == 0) {
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
        if (context != null && context) {
          logger.log(`[clearAllLatestMessages] context: ${context}`);
        }

        for (const key of latestMessageKeys) {
          if (skipFirst === true && key == 0) {
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

const updateConversationSelector = selectorFamily({
  key: 'updateConversationSelector',
  get: () => () => null as Partial<TConversation> | null,
  set:
    (conversationId: string) =>
    ({ set, get }, newPartialConversation) => {
      if (newPartialConversation instanceof DefaultValue) {
        return;
      }

      const keys = get(conversationKeysAtom);
      keys.forEach((key) => {
        set(conversationByIndex(key), (prevConversation) => {
          if (prevConversation && prevConversation.conversationId === conversationId) {
            return {
              ...prevConversation,
              ...newPartialConversation,
            };
          }
          return prevConversation;
        });
      });
    },
});

export default {
  conversationKeysAtom,
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
  showPopoverFamily,
  latestMessageFamily,
  messagesSiblingIdxFamily,
  anySubmittingSelector,
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
  updateConversationSelector,
};
