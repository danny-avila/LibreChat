import { useRecoilCallback } from 'recoil';
import { LocalStorageKeys } from 'librechat-data-provider';
import store from '~/store';

export default function useClearStates() {
  const clearConversations = store.useClearConvoState();
  const clearSubmissions = store.useClearSubmissionState();
  const clearLatestMessages = store.useClearLatestMessages();

  const clearStates = useRecoilCallback(
    ({ reset, snapshot }) =>
      async (skipFirst?: boolean) => {
        await clearSubmissions(skipFirst);
        await clearConversations(skipFirst);
        await clearLatestMessages(skipFirst);

        const keys = await snapshot.getPromise(store.conversationKeysAtom);

        for (const key of keys) {
          if (skipFirst === true && key === 0) {
            continue;
          }

          // Reset atom families
          reset(store.filesByIndex(key));
          reset(store.presetByIndex(key));
          reset(store.textByIndex(key));
          reset(store.showStopButtonByIndex(key));
          reset(store.abortScrollFamily(key));
          reset(store.isSubmittingFamily(key));
          reset(store.optionSettingsFamily(key));
          reset(store.showAgentSettingsFamily(key));
          reset(store.showBingToneSettingFamily(key));
          reset(store.showPopoverFamily(key));
          reset(store.showMentionPopoverFamily(key));
          reset(store.showPlusPopoverFamily(key));
          reset(store.showPromptsPopoverFamily(key));
          reset(store.activePromptByIndex(key));
          reset(store.globalAudioURLFamily(key));
          reset(store.globalAudioFetchingFamily(key));
          reset(store.globalAudioPlayingFamily(key));
          reset(store.activeRunFamily(key));
          reset(store.audioRunFamily(key));
          reset(store.messagesSiblingIdxFamily(key.toString()));
        }

        // Clear localStorage items if needed
        const clearLocalStorage = (skipFirst?: boolean) => {
          const keys = Object.keys(localStorage);
          keys.forEach((key) => {
            if (skipFirst === true && key.endsWith('0')) {
              return;
            }
            if (
              key.startsWith(LocalStorageKeys.ASST_ID_PREFIX) ||
              key.startsWith(LocalStorageKeys.AGENT_ID_PREFIX) ||
              key.startsWith(LocalStorageKeys.LAST_CONVO_SETUP) ||
              key === LocalStorageKeys.LAST_SPEC ||
              key === LocalStorageKeys.LAST_TOOLS
            ) {
              localStorage.removeItem(key);
            }
          });
        };

        clearLocalStorage(skipFirst);
      },
    [],
  );

  return clearStates;
}
