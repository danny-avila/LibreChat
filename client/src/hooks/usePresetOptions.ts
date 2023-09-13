import { TPreset } from 'librechat-data-provider';
import type { TSetOptionsPayload, TSetExample, TSetOption } from '~/common';
import { useRecoilState, useRecoilValue } from 'recoil';
import { cleanupPreset } from '~/utils';
import store from '~/store';

type TUsePresetOptions = (preset?: TPreset | boolean | null) => TSetOptionsPayload | boolean;

const usePresetOptions: TUsePresetOptions = (_preset) => {
  const [preset, setPreset] = useRecoilState(store.preset);
  const endpointsConfig = useRecoilValue(store.endpointsConfig);
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
        endpointsConfig,
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
        endpointsConfig,
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
        endpointsConfig,
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
          endpointsConfig,
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
        endpointsConfig,
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
        endpointsConfig,
      }),
    );
  };

  const checkPluginSelection: (value: string) => boolean = () => false;
  const setTools: (newValue: string) => void = () => {
    return;
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

export default usePresetOptions;
