import {
  UseSetOptions,
  TConversation,
  SetOption,
  SetExample,
  TPlugin,
} from 'librechat-data-provider';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
import store from '~/store';

export default function useSetOptions(): UseSetOptions {
  const setShowPluginStoreDialog = useSetRecoilState(store.showPluginStoreDialog);
  const [conversation, setConversation] = useRecoilState(store.conversation);
  const availableTools = useRecoilValue(store.availableTools);

  const setOption: SetOption = (param) => (newValue) => {
    const update = {};
    update[param] = newValue;
    setConversation(
      (prevState) =>
        ({
          ...prevState,
          ...update,
        } as TConversation),
    );
  };

  const setExample: SetExample = (i, type, newValue = null) => {
    const update = {};
    const current = conversation?.examples?.slice() || [];
    const currentExample = { ...current[i] } || {};
    currentExample[type] = { content: newValue };
    current[i] = currentExample;
    update['examples'] = current;
    setConversation(
      (prevState) =>
        ({
          ...prevState,
          ...update,
        } as TConversation),
    );
  };

  const addExample: () => void = () => {
    const update = {};
    const current = conversation?.examples?.slice() || [];
    current.push({ input: { content: '' }, output: { content: '' } });
    update['examples'] = current;
    setConversation(
      (prevState) =>
        ({
          ...prevState,
          ...update,
        } as TConversation),
    );
  };

  const removeExample: () => void = () => {
    const update = {};
    const current = conversation?.examples?.slice() || [];
    if (current.length <= 1) {
      update['examples'] = [{ input: { content: '' }, output: { content: '' } }];
      setConversation(
        (prevState) =>
          ({
            ...prevState,
            ...update,
          } as TConversation),
      );
      return;
    }
    current.pop();
    update['examples'] = current;
    setConversation(
      (prevState) =>
        ({
          ...prevState,
          ...update,
        } as TConversation),
    );
  };

  const getConversation: () => TConversation | null = () => conversation;

  function checkPluginSelection(value: string) {
    if (!conversation?.tools) {
      return false;
    }
    return conversation.tools.find((el) => el.pluginKey === value) ? true : false;
  }

  const setAgentOption: SetOption = (param) => (newValue) => {
    const editableConvo = JSON.stringify(conversation);
    const convo = JSON.parse(editableConvo);
    const { agentOptions } = convo;
    agentOptions[param] = newValue;
    setConversation(
      (prevState) =>
        ({
          ...prevState,
          agentOptions,
        } as TConversation),
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
        ({
          ...prevState,
          ...update,
        } as TConversation),
    );
  };

  return {
    setOption,
    setExample,
    addExample,
    removeExample,
    getConversation,
    checkPluginSelection,
    setAgentOption,
    setTools,
  };
}
