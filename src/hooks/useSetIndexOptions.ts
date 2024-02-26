import { useRecoilValue, useSetRecoilState } from 'recoil';
import {
  TPreset,
  TPlugin,
  tConvoUpdateSchema,
  EModelEndpoint,
  TConversation,
} from 'librechat-data-provider';
import type { TSetExample, TSetOption, TSetOptionsPayload } from '~/common';
import usePresetIndexOptions from './usePresetIndexOptions';
import { useChatContext } from '~/Providers/ChatContext';
import useLocalStorage from './useLocalStorage';
import store from '~/store';

type TUseSetOptions = (preset?: TPreset | boolean | null) => TSetOptionsPayload;

const useSetOptions: TUseSetOptions = (preset = false) => {
  const setShowPluginStoreDialog = useSetRecoilState(store.showPluginStoreDialog);
  const availableTools = useRecoilValue(store.availableTools);
  const { conversation, setConversation } = useChatContext();
  const [lastBingSettings, setLastBingSettings] = useLocalStorage('lastBingSettings', {});
  const [lastModel, setLastModel] = useLocalStorage('lastSelectedModel', {
    primaryModel: '',
    secondaryModel: '',
  });

  const result = usePresetIndexOptions(preset);

  if (result && typeof result !== 'boolean') {
    return result;
  }

  const setOption: TSetOption = (param) => (newValue) => {
    const { endpoint } = conversation ?? {};
    const update = {};
    update[param] = newValue;

    if (param === 'model' && endpoint) {
      const lastModelUpdate = { ...lastModel, [endpoint]: newValue };
      setLastModel(lastModelUpdate);
    } else if (param === 'jailbreak' && endpoint) {
      setLastBingSettings({ ...lastBingSettings, jailbreak: newValue });
    }

    setConversation(
      (prevState) =>
        tConvoUpdateSchema.parse({
          ...prevState,
          ...update,
        }) as TConversation,
    );
  };

  const setExample: TSetExample = (i, type, newValue = null) => {
    const update = {};
    const current = conversation?.examples?.slice() || [];
    const currentExample = { ...current[i] } || {};
    currentExample[type] = { content: newValue };
    current[i] = currentExample;
    update['examples'] = current;
    setConversation(
      (prevState) =>
        tConvoUpdateSchema.parse({
          ...prevState,
          ...update,
        }) as TConversation,
    );
  };

  const addExample: () => void = () => {
    const update = {};
    const current = conversation?.examples?.slice() || [];
    current.push({ input: { content: '' }, output: { content: '' } });
    update['examples'] = current;
    setConversation(
      (prevState) =>
        tConvoUpdateSchema.parse({
          ...prevState,
          ...update,
        }) as TConversation,
    );
  };

  const removeExample: () => void = () => {
    const update = {};
    const current = conversation?.examples?.slice() || [];
    if (current.length <= 1) {
      update['examples'] = [{ input: { content: '' }, output: { content: '' } }];
      setConversation(
        (prevState) =>
          tConvoUpdateSchema.parse({
            ...prevState,
            ...update,
          }) as TConversation,
      );
      return;
    }
    current.pop();
    update['examples'] = current;
    setConversation(
      (prevState) =>
        tConvoUpdateSchema.parse({
          ...prevState,
          ...update,
        }) as TConversation,
    );
  };

  function checkPluginSelection(value: string) {
    if (!conversation?.tools) {
      return false;
    }
    return conversation.tools.find((el) => el.pluginKey === value) ? true : false;
  }

  const setAgentOption: TSetOption = (param) => (newValue) => {
    const editableConvo = JSON.stringify(conversation);
    const convo = JSON.parse(editableConvo);
    const { agentOptions } = convo;
    agentOptions[param] = newValue;
    console.log('agentOptions', agentOptions, param, newValue);
    if (param === 'model' && typeof newValue === 'string') {
      const lastModelUpdate = { ...lastModel, [EModelEndpoint.gptPlugins]: newValue };
      lastModelUpdate.secondaryModel = newValue;
      setLastModel(lastModelUpdate);
    }
    setConversation(
      (prevState) =>
        tConvoUpdateSchema.parse({
          ...prevState,
          agentOptions,
        }) as TConversation,
    );
  };

  const setTools: (newValue: string) => void = (newValue) => {
    if (newValue === 'pluginStore') {
      setShowPluginStoreDialog(true);
      return;
    }

    const update = {};
    const current = conversation?.tools || [];
    const isSelected = checkPluginSelection(newValue);
    const tool =
      availableTools[availableTools.findIndex((el: TPlugin) => el.pluginKey === newValue)];
    if (isSelected) {
      update['tools'] = current.filter((el) => el.pluginKey !== newValue);
    } else {
      update['tools'] = [...current, tool];
    }

    localStorage.setItem('lastSelectedTools', JSON.stringify(update['tools']));
    setConversation(
      (prevState) =>
        tConvoUpdateSchema.parse({
          ...prevState,
          ...update,
        }) as TConversation,
    );
  };

  return {
    setOption,
    setExample,
    addExample,
    removeExample,
    setAgentOption,
    checkPluginSelection,
    setTools,
  };
};

export default useSetOptions;
