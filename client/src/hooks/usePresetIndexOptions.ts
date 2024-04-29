import { useRecoilValue, useSetRecoilState } from 'recoil';
import type { TPreset, TPlugin } from 'librechat-data-provider';
import type { TSetOptionsPayload, TSetExample, TSetOption } from '~/common';
import { useChatContext } from '~/Providers/ChatContext';
import { cleanupPreset } from '~/utils';
import store from '~/store';

type TUsePresetOptions = (preset?: TPreset | boolean | null) => TSetOptionsPayload | boolean;

const usePresetIndexOptions: TUsePresetOptions = (_preset) => {
  const setShowPluginStoreDialog = useSetRecoilState(store.showPluginStoreDialog);
  const availableTools = useRecoilValue(store.availableTools);
  const { preset, setPreset } = useChatContext();

  if (!_preset) {
    return false;
  }
  const getConversation: () => TPreset | null = () => preset;

  const setOption: TSetOption = (param) => (newValue) => {
    const update = {};
    update[param] = newValue;
    setPreset((prevState) =>
      cleanupPreset({
        preset: {
          ...prevState,
          ...update,
        },
      }),
    );
  };

  const setExample: TSetExample = (i, type, newValue = null) => {
    const update = {};
    const current = preset?.examples?.slice() || [];
    const currentExample = { ...current[i] } || {};
    currentExample[type] = { content: newValue };
    current[i] = currentExample;
    update['examples'] = current;
    setPreset((prevState) =>
      cleanupPreset({
        preset: {
          ...prevState,
          ...update,
        },
      }),
    );
  };

  const addExample: () => void = () => {
    const update = {};
    const current = preset?.examples?.slice() || [];
    current.push({ input: { content: '' }, output: { content: '' } });
    update['examples'] = current;
    setPreset((prevState) =>
      cleanupPreset({
        preset: {
          ...prevState,
          ...update,
        },
      }),
    );
  };

  const removeExample: () => void = () => {
    const update = {};
    const current = preset?.examples?.slice() || [];
    if (current.length <= 1) {
      update['examples'] = [{ input: { content: '' }, output: { content: '' } }];
      setPreset((prevState) =>
        cleanupPreset({
          preset: {
            ...prevState,
            ...update,
          },
        }),
      );
      return;
    }
    current.pop();
    update['examples'] = current;
    setPreset((prevState) =>
      cleanupPreset({
        preset: {
          ...prevState,
          ...update,
        },
      }),
    );
  };

  const setAgentOption: TSetOption = (param) => (newValue) => {
    const editablePreset = JSON.parse(JSON.stringify(_preset));
    const { agentOptions } = editablePreset;
    agentOptions[param] = newValue;
    setPreset((prevState) =>
      cleanupPreset({
        preset: {
          ...prevState,
          agentOptions,
        },
      }),
    );
  };

  function checkPluginSelection(value: string) {
    if (!preset?.tools) {
      return false;
    }
    return preset.tools.find((el) => {
      if (typeof el === 'string') {
        return el === value;
      }
      return el.pluginKey === value;
    })
      ? true
      : false;
  }

  const setTools: (newValue: string, remove?: boolean) => void = (newValue, remove) => {
    if (newValue === 'pluginStore') {
      setShowPluginStoreDialog(true);
      return;
    }

    const update = {};
    const current =
      preset?.tools
        ?.map((tool: string | TPlugin) => {
          if (typeof tool === 'string') {
            return availableTools[tool];
          }
          return tool;
        })
        ?.filter((el) => !!el) || [];
    const isSelected = checkPluginSelection(newValue);
    const tool = availableTools[newValue];
    if (isSelected || remove) {
      update['tools'] = current.filter((el) => el.pluginKey !== newValue);
    } else {
      update['tools'] = [...current, tool];
    }

    setPreset((prevState) =>
      cleanupPreset({
        preset: {
          ...prevState,
          ...update,
        },
      }),
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
};

export default usePresetIndexOptions;
