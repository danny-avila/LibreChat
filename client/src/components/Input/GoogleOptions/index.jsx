import { useState } from 'react';
import { Settings2,  } from 'lucide-react';
import { useRecoilState, useRecoilValue } from 'recoil';
import MessagesSquared from '~/components/svg/MessagesSquared.jsx';
import SelectDropDown from '../../ui/SelectDropDown';
import EndpointOptionsPopover from '../../Endpoints/EndpointOptionsPopover';
import SaveAsPresetDialog from '../../Endpoints/SaveAsPresetDialog';
import { Button } from '../../ui/Button.tsx';
import Settings from '../../Endpoints/Google/Settings.jsx';
import Examples from '../../Endpoints/Google/Examples.jsx';
import { cn } from '~/utils/';

import store from '~/store';

function GoogleOptions() {
  const [advancedMode, setAdvancedMode] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const [saveAsDialogShow, setSaveAsDialogShow] = useState(false);

  const [conversation, setConversation] = useRecoilState(store.conversation) || {};
  const { endpoint, conversationId } = conversation;
  const { model, modelLabel, promptPrefix, examples, temperature, topP, topK, maxOutputTokens } =
    conversation;

  const endpointsConfig = useRecoilValue(store.endpointsConfig);

  if (endpoint !== 'google') return null;
  if (conversationId !== 'new') return null;

  const models = endpointsConfig?.['google']?.['availableModels'] || [];

  const triggerAdvancedMode = () => setAdvancedMode(prev => !prev);
  const triggerExamples = () => setShowExamples(prev => !prev);

  const switchToSimpleMode = () => {
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

  const setExample = (i, type, newValue = null) => {
    let update = {};
    let current = conversation?.examples.slice() || [];
    let currentExample =  { ...current[i] } || {};
    currentExample[type] = newValue;
    current[i] = currentExample;
    update.examples = current;
    console.log('setOption', update);
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
        <SelectDropDown
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
            {showExamples ? (
            <Examples
            examples={examples}
            setExample={setExample}
          />
            ) : (
            <Settings
              model={model}
              modelLabel={modelLabel}
              promptPrefix={promptPrefix}
              temperature={temperature}
              topP={topP}
              topK={topK}
              maxOutputTokens={maxOutputTokens}
              setOption={setOption}
            />
            )}
          </div>
        }
        visible={advancedMode}
        saveAsPreset={saveAsPreset}
        switchToSimpleMode={switchToSimpleMode}
        additionalButton={{
          label: (showExamples ? 'Hide': 'Show') + ' Examples',
          handler: triggerExamples,
          icon: <MessagesSquared className="mr-1 w-[14px]" />
        }}
      />
      <SaveAsPresetDialog
        open={saveAsDialogShow}
        onOpenChange={setSaveAsDialogShow}
        preset={conversation}
      />
    </>
  );
}

export default GoogleOptions;
