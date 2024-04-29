import { EModelEndpoint, LocalStorageKeys } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import useLocalStorage from './useLocalStorage';

const useSetStorage = () => {
  const [lastBingSettings, setLastBingSettings] = useLocalStorage(LocalStorageKeys.LAST_BING, {});
  const setLastConvo = useLocalStorage(LocalStorageKeys.LAST_CONVO_SETUP, {})[1];
  const [lastModel, setLastModel] = useLocalStorage(LocalStorageKeys.LAST_MODEL, {
    primaryModel: '',
    secondaryModel: '',
  });

  const setStorage = (conversation: TConversation) => {
    const { endpoint } = conversation;
    if (endpoint && endpoint !== EModelEndpoint.bingAI) {
      const lastModelUpdate = { ...lastModel, [endpoint]: conversation?.model };
      if (endpoint === EModelEndpoint.gptPlugins) {
        lastModelUpdate.secondaryModel = conversation?.agentOptions?.model ?? '';
      }
      setLastModel(lastModelUpdate);
    } else if (endpoint === EModelEndpoint.bingAI) {
      const { jailbreak, toneStyle } = conversation;
      setLastBingSettings({ ...lastBingSettings, jailbreak, toneStyle });
    }

    setLastConvo(conversation);
  };

  return setStorage;
};

export default useSetStorage;
