import { TConversation, TPreset, TPlugin, tConversationSchema } from 'librechat-data-provider';
import type { TSetExample, TSetOption, TSetOptionsPayload } from '~/common';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
import usePresetOptions from './usePresetOptions';
import store from '~/store';

type TUseSetOptions = (preset?: TPreset | boolean | null) => TSetOptionsPayload;

const useSetOptions: TUseSetOptions = (preset = false) => {
  const setShowPluginStoreDialog = useSetRecoilState(store.showPluginStoreDialog);
  const [conversation, setConversation] = useRecoilState(store.conversation);
  const availableTools = useRecoilValue(store.availableTools);

  const result = usePresetOptions(preset);

  if (result && typeof result !== 'boolean') {
    return result;
  }

  const setOption: TSetOption = (param) => (newValue) => {
    const update = {};
    update[param] = newValue;
    setConversation((prevState) =>
      tConversationSchema.parse({
        ...prevState,
        ...update,
      }),
    );
  };

  const setExample: TSetExample = (i, type, newValue = null) => {
    const update = {};
    const current = conversation?.examples?.slice() || [];
    const currentExample = { ...current[i] } || {};
    currentExample[type] = { content: newValue };
    current[i] = currentExample;
    update['examples'] = current;
    setConversation((prevState) =>
      tConversationSchema.parse({
        ...prevState,
        ...update,
      }),
    );
  };

  const addExample: () => void = () => {
    const update = {};
    const current = conversation?.examples?.slice() || [];
    current.push({ input: { content: '' }, output: { content: '' } });
    update['examples'] = current;
    setConversation((prevState) =>
      tConversationSchema.parse({
        ...prevState,
        ...update,
      }),
    );
  };

  const removeExample: () => void = () => {
    const update = {};
    const current = conversation?.examples?.slice() || [];
    if (current.length <= 1) {
      update['examples'] = [{ input: { content: '' }, output: { content: '' } }];
      setConversation((prevState) =>
        tConversationSchema.parse({
          ...prevState,
          ...update,
        }),
      );
      return;
    }
    current.pop();
    update['examples'] = current;
    setConversation((prevState) =>
      tConversationSchema.parse({
        ...prevState,
        ...update,
      }),
    );
  };

  const getConversation: () => TConversation | null = () => conversation;

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
    setConversation((prevState) =>
      tConversationSchema.parse({
        ...prevState,
        agentOptions,
      }),
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
    setConversation((prevState) =>
      tConversationSchema.parse({
        ...prevState,
        ...update,
      }),
    );
  };

  return {
    setOption,
    setExample,
    addExample,
    removeExample,
    setAgentOption,
    getConversation,
    checkPluginSelection,
    setTools,
  };
};

export default useSetOptions;
