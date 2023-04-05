import React, { useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { useRecoilState, useRecoilValue } from 'recoil';
import SelectDropdown from '../../ui/SelectDropdown';
import EndpointOptionsPopover from '../../Endpoints/EndpointOptionsPopover';
import SaveAsPresetDialog from '../../Endpoints/SaveAsPresetDialog';
import { Button } from '../../ui/Button.tsx';
import Settings from '../../Endpoints/OpenAI/Settings.jsx';
import { cn } from '~/utils/';

import store from '~/store';

function OpenAIOptions() {
  const [advancedMode, setAdvancedMode] = useState(false);
  const [saveAsDialogShow, setSaveAsDialogShow] = useState(false);

  const [conversation, setConversation] = useRecoilState(store.conversation) || {};
  const { endpoint, conversationId } = conversation;
  const { model, chatGptLabel, promptPrefix, temperature, top_p, presence_penalty, frequency_penalty } =
    conversation;

  const endpointsConfig = useRecoilValue(store.endpointsConfig);

  // useEffect(() => {
  //   if (endpoint !== 'openAI') return;

  //   const mustInAdvancedMode =
  //     chatGptLabel !== null ||
  //     promptPrefix !== null ||
  //     temperature !== 1 ||
  //     top_p !== 1 ||
  //     presence_penalty !== 0 ||
  //     frequency_penalty !== 0;

  //   if (mustInAdvancedMode && !advancedMode) setAdvancedMode(true);
  // }, [conversation, advancedMode]);

  if (endpoint !== 'openAI') return null;
  if (conversationId !== 'new') return null;

  const models = endpointsConfig?.['openAI']?.['availableModels'] || [];

  const triggerAdvancedMode = () => setAdvancedMode(prev => !prev);

  const switchToSimpleMode = () => {
    // setConversation(prevState => ({
    //   ...prevState,
    //   chatGptLabel: null,
    //   promptPrefix: null,
    //   temperature: 1,
    //   top_p: 1,
    //   presence_penalty: 0,
    //   frequency_penalty: 0
    // }));
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
    'transition-colors shadow-md rounded-md min-w-[75px] font-normal bg-white border-black/10 hover:border-black/10 focus:border-black/10 dark:border-black/10 dark:hover:border-black/10 dark:focus:border-black/10 border dark:bg-gray-700 text-black dark:text-white';

  return (
    <>
      <div
        className={
          'openAIOptions-simple-container flex w-full flex-wrap items-center justify-center gap-2' +
          (!advancedMode ? ' show' : '')
        }
      >
        {/* <ModelSelect
          model={model}
          availableModels={availableModels}
          onChange={setOption('model')}
          type="button"
          className={cn(
            cardStyle,
            ' z-50 flex h-[40px] items-center justify-center px-4 hover:bg-slate-50 data-[state=open]:bg-slate-50 dark:hover:bg-gray-600 dark:data-[state=open]:bg-gray-600'
          )}
        /> */}
        <SelectDropdown
          value={model}
          setValue={setOption('model')}
          availableValues={models}
          showAbove={true}
          showLabel={false}
          className={cn(
            cardStyle,
            'min-w-48 z-50 flex h-[40px] w-48 flex-none items-center justify-center px-4 ring-0 hover:cursor-pointer hover:bg-slate-50 focus:ring-0 focus:ring-offset-0 data-[state=open]:bg-slate-50 dark:bg-gray-700 dark:hover:bg-gray-600 dark:data-[state=open]:bg-gray-600'
          )}
        />
        <Button
          type="button"
          className={cn(
            cardStyle,
            'min-w-4 z-50 flex h-[40px] flex-none items-center justify-center px-4 hover:bg-slate-50 focus:ring-0 focus:ring-offset-0 dark:hover:bg-gray-600'
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
              chatGptLabel={chatGptLabel}
              promptPrefix={promptPrefix}
              temperature={temperature}
              topP={top_p}
              freqP={presence_penalty}
              presP={frequency_penalty}
              setOption={setOption}
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
        preset={conversation}
      />
    </>
  );
}

export default OpenAIOptions;
