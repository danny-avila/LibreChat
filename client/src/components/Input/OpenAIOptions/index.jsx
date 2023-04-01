import React, { useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { useRecoilState, useRecoilValue } from 'recoil';
import ModelSelect from '../../ui/ModelSelect';
import EndpointOptionsPopover from '../../Endpoints/EndpointOptionsPopover';
import SaveAsPresetDialog from '../../Endpoints/SaveAsPresetDialog';
import { Button } from '../../ui/Button.tsx';
import Settings from '../../Endpoints/OpenAI/Settings.jsx';
import { cn } from '~/utils/';

import store from '~/store';

function OpenAIOptions() {
  const [advancedMode, setAdvancedMode] = useState(false);
  const [saveAsDialogShow, setSaveAsDialogShow] = useState(false);

  const endpointsConfig = useRecoilValue(store.endpointsConfig);
  const availableModels = endpointsConfig?.['openAI']?.['availableModels'] || [];

  const [conversation, setConversation] = useRecoilState(store.conversation) || {};
  const { endpoint, conversationId } = conversation;
  const { model, chatGptLabel, promptPrefix, temperature, top_p, presence_penalty, frequency_penalty } =
    conversation;

  useEffect(() => {
    if (endpoint !== 'openAI') return;

    const mustInAdvancedMode =
      chatGptLabel !== null ||
      promptPrefix !== null ||
      temperature !== 1 ||
      top_p !== 1 ||
      presence_penalty !== 0 ||
      frequency_penalty !== 0;

    if (mustInAdvancedMode && !advancedMode) setAdvancedMode(true);
  }, [conversation, advancedMode]);

  if (endpoint !== 'openAI') return null;
  if (conversationId !== 'new') return null;

  const triggerAdvancedMode = () => setAdvancedMode(prev => !prev);

  const switchToSimpleMode = () => {
    setConversation(prevState => ({
      ...prevState,
      chatGptLabel: null,
      promptPrefix: null,
      temperature: 1,
      top_p: 1,
      presence_penalty: 0,
      frequency_penalty: 0
    }));
    setAdvancedMode(false);
  };

  const saveAsPreset = () => {
    setSaveAsDialogShow(true);
  };

  const setOption = param => newValue => {
    let update = {};
    update[param] = newValue;
    setConversation(prevState => ({
      ...prevState,
      ...update
    }));
  };

  const cardStyle =
    'shadow-md rounded-md min-w-[75px] font-normal bg-white border-black/10 border dark:bg-gray-700 text-black dark:text-white';

  return (
    <>
      <div
        className={
          'openAIOptions-simple-container flex w-full items-center justify-center gap-2' +
          (!advancedMode ? ' show' : '')
        }
      >
        <ModelSelect
          model={model}
          availableModels={availableModels}
          onChange={setOption('model')}
          type="button"
          className={cn(
            cardStyle,
            ' z-50 flex h-[40px] items-center justify-center px-4 hover:bg-slate-50 data-[state=open]:bg-slate-50 dark:hover:bg-gray-600 dark:data-[state=open]:bg-gray-600'
          )}
        />
        <Button
          type="button"
          className={cn(
            cardStyle,
            ' min-w-4 z-50 flex h-[40px] items-center justify-center px-4 hover:bg-slate-50 focus:ring-0 focus:ring-offset-0 dark:hover:bg-gray-600'
          )}
          onClick={triggerAdvancedMode}
        >
          <Settings2 className="w-4 text-gray-600 dark:text-white" />
        </Button>
      </div>
      <EndpointOptionsPopover
        content={
          <div className="px-4 py-4">
            <Settings
              model={model}
              setModel={setOption('model')}
              chatGptLabel={chatGptLabel}
              setChatGptLabel={setOption('chatGptLabel')}
              promptPrefix={promptPrefix}
              setPromptPrefix={setOption('promptPrefix')}
              temperature={temperature}
              setTemperature={setOption('temperature')}
              topP={top_p}
              setTopP={setOption('top_p')}
              freqP={presence_penalty}
              setFreqP={setOption('presence_penalty')}
              presP={frequency_penalty}
              setPresP={setOption('frequency_penalty')}
            />
          </div>
        }
        visible={advancedMode}
        saveAsPreset={saveAsPreset}
        switchToSimpleMode={switchToSimpleMode}
      />
      <SaveAsPresetDialog
        open={saveAsDialogShow}
        onOpenChange={setSaveAsDialogShow}
        conversation={conversation}
      />
    </>
  );
}

export default OpenAIOptions;
