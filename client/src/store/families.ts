import { useEffect, useCallback } from 'react';
import { atom, useAtom, useAtomValue, useSetAtom, useStore } from 'jotai';
import { atomFamily, selectAtom } from 'jotai/utils';
import { LocalStorageKeys, Constants } from 'librechat-data-provider';
import type { TMessage, TPreset, TConversation, TSubmission } from 'librechat-data-provider';
import type { TOptionSettings, ExtendedFile } from '~/common';
import { useSetConvoContext } from '~/Providers/SetConvoContext';
import { storeEndpointSettings, logger, createChatSearchParams } from '~/utils';
import { createSearchParams } from 'react-router-dom';

const latestMessageKeysAtom = atom<(string | number)[]>([]);

const submissionKeysAtom = atom<(string | number)[]>([]);

const latestMessageFamily = atomFamily(
  (key: string | number | null) => {
    const baseAtom = atom<TMessage | null>(null);
    return atom(
      (get) => get(baseAtom),
      (get, set, newValue: TMessage | null) => {
        set(baseAtom, newValue);
        if (key !== null) {
          logger.log('Jotai Effect: Setting latestMessage', { key, newValue });
        }
      },
    );
  },
  (prevKey, nextKey) => prevKey === nextKey,
);

const submissionByIndex = atomFamily(
  (_key: string | number) => atom<TSubmission | null>(null),
  (prevKey, nextKey) => prevKey === nextKey,
);

const conversationKeysAtom = atom<(string | number)[]>([]);

const latestMessageKeysSelector = atom(
  (get) => {
    const keys = get(conversationKeysAtom);
    return keys.filter((key) => get(latestMessageFamily(key)) !== null);
  },
  (get, set, newKeys: (string | number)[]) => {
    logger.log('setting latestMessageKeys', { newKeys });
    set(latestMessageKeysAtom, newKeys);
  },
);

const submissionKeysSelector = atom(
  (get) => {
    const keys = get(conversationKeysAtom);
    return keys.filter((key) => get(submissionByIndex(key)) !== null);
  },
  (get, set, newKeys: (string | number)[]) => {
    logger.log('setting submissionKeysAtom', newKeys);
    set(submissionKeysAtom, newKeys);
  },
);

const conversationByIndex = atomFamily(
  (key: string | number) => {
    const baseAtom = atom<TConversation | null>(null);
    return atom(
      (get) => get(baseAtom),
      (get, set, newValue: TConversation | null) => {
        const oldValue = get(baseAtom);
        set(baseAtom, newValue);

        const index = Number(key);
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
      },
    );
  },
  (prevKey, nextKey) => prevKey === nextKey,
);

const filesByIndex = atomFamily(
  (_key: string | number) => atom<Map<string, ExtendedFile>>(new Map()),
  (prevKey, nextKey) => prevKey === nextKey,
);

const allConversationsSelector = atom((get) => {
  const keys = get(conversationKeysAtom);
  return keys.map((key) => get(conversationByIndex(key))).map((convo) => convo?.conversationId);
});

const presetByIndex = atomFamily(
  (_key: string | number) => atom<TPreset | null>(null),
  (prevKey, nextKey) => prevKey === nextKey,
);

const textByIndex = atomFamily(
  (_key: string | number) => atom<string>(''),
  (prevKey, nextKey) => prevKey === nextKey,
);

const showStopButtonByIndex = atomFamily(
  (_key: string | number) => atom<boolean>(false),
  (prevKey, nextKey) => prevKey === nextKey,
);

const abortScrollFamily = atomFamily(
  (key: string | number) => {
    const baseAtom = atom<boolean>(false);
    return atom(
      (get) => get(baseAtom),
      (get, set, newValue: boolean) => {
        set(baseAtom, newValue);
        logger.log('message_scrolling', 'Jotai Effect: Setting abortScrollByIndex', {
          key,
          newValue,
        });
      },
    );
  },
  (prevKey, nextKey) => prevKey === nextKey,
);

const isSubmittingFamily = atomFamily(
  (_key: string | number) => atom(false),
  (prevKey, nextKey) => prevKey === nextKey,
);

const optionSettingsFamily = atomFamily(
  (_key: string | number) => atom<TOptionSettings>({}),
  (prevKey, nextKey) => prevKey === nextKey,
);

const showAgentSettingsFamily = atomFamily(
  (_key: string | number) => atom<boolean>(false),
  (prevKey, nextKey) => prevKey === nextKey,
);

const showPopoverFamily = atomFamily(
  (_key: string | number) => atom<boolean>(false),
  (prevKey, nextKey) => prevKey === nextKey,
);

const activePromptByIndex = atomFamily(
  (_key: string | number | null) => atom<string | undefined>(undefined),
  (prevKey, nextKey) => prevKey === nextKey,
);

const showMentionPopoverFamily = atomFamily(
  (_key: string | number | null) => atom<boolean>(false),
  (prevKey, nextKey) => prevKey === nextKey,
);

const showPlusPopoverFamily = atomFamily(
  (_key: string | number | null) => atom<boolean>(false),
  (prevKey, nextKey) => prevKey === nextKey,
);

const showPromptsPopoverFamily = atomFamily(
  (_key: string | number | null) => atom<boolean>(false),
  (prevKey, nextKey) => prevKey === nextKey,
);

const globalAudioURLFamily = atomFamily(
  (_key: string | number | null) => atom<string | null>(null),
  (prevKey, nextKey) => prevKey === nextKey,
);

const globalAudioFetchingFamily = atomFamily(
  (_key: string | number | null) => atom<boolean>(false),
  (prevKey, nextKey) => prevKey === nextKey,
);

const globalAudioPlayingFamily = atomFamily(
  (_key: string | number | null) => atom<boolean>(false),
  (prevKey, nextKey) => prevKey === nextKey,
);

const activeRunFamily = atomFamily(
  (_key: string | number | null) => atom<string | null>(null),
  (prevKey, nextKey) => prevKey === nextKey,
);

const audioRunFamily = atomFamily(
  (_key: string | number | null) => atom<string | null>(null),
  (prevKey, nextKey) => prevKey === nextKey,
);

const messagesSiblingIdxFamily = atomFamily(
  (_key: string | null | undefined) => atom<number>(0),
  (prevKey, nextKey) => prevKey === nextKey,
);

function useCreateConversationAtom(key: string | number) {
  const hasSetConversation = useSetConvoContext();
  const [keys, setKeys] = useAtom(conversationKeysAtom);
  const setConversation = useSetAtom(conversationByIndex(key));
  const conversation = useAtomValue(conversationByIndex(key));

  useEffect(() => {
    if (!keys.includes(key)) {
      setKeys([...keys, key]);
    }
  }, [key, keys, setKeys]);

  return { hasSetConversation, conversation, setConversation };
}

function useClearConvoState() {
  const store = useStore();

  /** Clears all active conversations. Pass `true` to skip the first or root conversation */
  const clearAllConversations = useCallback(
    async (skipFirst?: boolean) => {
      const conversationKeys = store.get(conversationKeysAtom);

      for (const conversationKey of conversationKeys) {
        if (skipFirst === true && conversationKey == 0) {
          continue;
        }

        store.set(conversationByIndex(conversationKey), null);

        const conversation = store.get(conversationByIndex(conversationKey));
        if (conversation) {
          store.set(latestMessageFamily(conversationKey), null);
        }
      }

      store.set(conversationKeysAtom, []);
    },
    [store],
  );

  return clearAllConversations;
}

const conversationByKeySelector = atomFamily(
  (index: string | number) =>
    selectAtom(conversationByIndex(index), (conversation) => conversation),
  (prevKey, nextKey) => prevKey === nextKey,
);

function useClearSubmissionState() {
  const store = useStore();

  const clearAllSubmissions = useCallback(
    async (skipFirst?: boolean) => {
      const submissionKeys = store.get(submissionKeysSelector);
      logger.log('submissionKeys', submissionKeys);

      for (const key of submissionKeys) {
        if (skipFirst === true && key == 0) {
          continue;
        }

        logger.log('resetting submission', key);
        store.set(submissionByIndex(key), null);
      }

      store.set(submissionKeysSelector, []);
    },
    [store],
  );

  return clearAllSubmissions;
}

function useClearLatestMessages(context?: string) {
  const store = useStore();

  const clearAllLatestMessages = useCallback(
    async (skipFirst?: boolean) => {
      const latestMessageKeys = store.get(latestMessageKeysSelector);
      logger.log('[clearAllLatestMessages] latestMessageKeys', latestMessageKeys);
      if (context != null && context) {
        logger.log(`[clearAllLatestMessages] context: ${context}`);
      }

      for (const key of latestMessageKeys) {
        if (skipFirst === true && key == 0) {
          continue;
        }

        logger.log(`[clearAllLatestMessages] resetting latest message; key: ${key}`);
        store.set(latestMessageFamily(key), null);
      }

      store.set(latestMessageKeysSelector, []);
    },
    [context, store],
  );

  return clearAllLatestMessages;
}

const updateConversationSelector = atomFamily(
  (conversationId: string) =>
    atom(
      () => null as Partial<TConversation> | null,
      (get, set, newPartialConversation: Partial<TConversation>) => {
        const keys = get(conversationKeysAtom);
        keys.forEach((key) => {
          const prevConversation = get(conversationByIndex(key));
          if (prevConversation && prevConversation.conversationId === conversationId) {
            set(conversationByIndex(key), {
              ...prevConversation,
              ...newPartialConversation,
            });
          }
        });
      },
    ),
  (prevKey, nextKey) => prevKey === nextKey,
);

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
