import { useRecoilValue, useSetRecoilState } from 'recoil';
import { TPreset, TPlugin, TConversation, tConvoUpdateSchema } from 'librechat-data-provider';
import type { TSetExample, TSetOption, TSetOptionsPayload } from '~/common';
import usePresetIndexOptions from './usePresetIndexOptions';
import { useChatContext } from '~/Providers/ChatContext';
import store from '~/store';

type TUseSetOptions = (preset?: TPreset | boolean | null) => TSetOptionsPayload;

const useSetIndexOptions: TUseSetOptions = (preset = false) => {
  const setShowPluginStoreDialog = useSetRecoilState(store.showPluginStoreDialog);
  const availableTools = useRecoilValue(store.availableTools);
  const { conversation, setConversation } = useChatContext();

  const result = usePresetIndexOptions(preset);

  if (result && typeof result !== 'boolean') {
    return result;
  }

  const setOption: TSetOption = (param) => (newValue) => {
    const update = {};
    update[param] = newValue;

    if (param === 'presetOverride') {
      const currentOverride = conversation?.presetOverride || {};
      update['presetOverride'] = {
        ...currentOverride,
        ...(newValue as unknown as Partial<TPreset>),
      };
    }

    // Auto-enable Responses API when web search is enabled
    if (param === 'web_search' && newValue === true) {
      const currentUseResponsesApi = conversation?.useResponsesApi ?? false;
      if (!currentUseResponsesApi) {
        update['useResponsesApi'] = true;
      }
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
    const currentExample = { ...current[i] };
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
    return conversation.tools.find((el) => {
      if (typeof el === 'string') {
        return el === value;
      }
      return el.pluginKey === value;
    })
      ? true
      : false;
  }

  const setAgentOption: TSetOption = (param) => (newValue) => {
    const editableConvo = JSON.stringify(conversation);
    const convo = JSON.parse(editableConvo);
    const { agentOptions } = convo;
    agentOptions[param] = newValue;

    setConversation(
      (prevState) =>
        tConvoUpdateSchema.parse({
          ...prevState,
          agentOptions,
        }) as TConversation,
    );
  };

  const setTools: (newValue: string, remove?: boolean) => void = (newValue, remove) => {
    if (newValue === 'pluginStore') {
      setShowPluginStoreDialog(true);
      return;
    }

    const update = {};
    const current =
      conversation?.tools
        ?.map((tool: string | TPlugin) => {
          if (typeof tool === 'string') {
            return availableTools[tool];
          }
          return tool;
        })
        .filter((el) => !!el) || [];
    const isSelected = checkPluginSelection(newValue);
    const tool = availableTools[newValue];
    if (isSelected || remove) {
      update['tools'] = current.filter((el) => el.pluginKey !== newValue);
    } else {
      update['tools'] = [...current, tool];
    }

    setConversation(
      (prevState) =>
        tConvoUpdateSchema.parse({
          ...prevState,
          ...update,
        }) as TConversation,
    );
  };

  return {
    setTools,
    setOption,
    setExample,
    addExample,
    removeExample,
    setAgentOption,
    checkPluginSelection,
  };
};

export default useSetIndexOptions;
