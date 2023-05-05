import { useState, useEffect } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { Settings2, ChevronDownIcon } from 'lucide-react';
import SelectDropDown from '../../ui/SelectDropDown';
import MultiSelectDropDown from '../../ui/MultiSelectDropDown';
import EndpointOptionsPopover from '../../Endpoints/EndpointOptionsPopover';
import SaveAsPresetDialog from '../../Endpoints/SaveAsPresetDialog';
import { Button } from '../../ui/Button.tsx';
import Settings from '../../Endpoints/OpenAI/Settings.jsx';
import { cn } from '~/utils/';

import store from '~/store';

function PluginsOptions() {
  const [advancedMode, setAdvancedMode] = useState(false);
  const [saveAsDialogShow, setSaveAsDialogShow] = useState(false);
  const [visibile, setVisibility] = useState(true);
  const [opacityClass, setOpacityClass] = useState('full-opacity');
  const messagesTree = useRecoilValue(store.messagesTree);
  const [conversation, setConversation] = useRecoilState(store.conversation) || {};
  const endpointsConfig = useRecoilValue(store.endpointsConfig);

  useEffect(() => {
    if (advancedMode) {
      return;
    } else if (messagesTree?.length >= 1) {
      setOpacityClass('show');
    } else {
      setOpacityClass('full-opacity');
    }
  }, [messagesTree]);
  
  const { endpoint, conversationId } = conversation;
  const { model, temperature, top_p, presence_penalty, frequency_penalty } = conversation;
  // const { model, chatGptLabel, promptPrefix, temperature, top_p, presence_penalty, frequency_penalty } = conversation;


  if (endpoint !== 'gptPlugins') return null;
  // if (conversationId !== 'new') return null; // --> allows to change options during conversation

  const models = endpointsConfig?.['gptPlugins']?.['availableModels'] || [];
  const availableTools = endpointsConfig?.['gptPlugins']?.['availableTools'] || [];

  const triggerAdvancedMode = () => setAdvancedMode(prev => !prev);

  const switchToSimpleMode = () => {
    setAdvancedMode(false);
  };

  const saveAsPreset = () => {
    setSaveAsDialogShow(true);
  };

  function checkIfSelected(value) {
    if (!conversation.tools) return false;
    return conversation.tools.find(el => el.value === value) ? true : false;
  }

  const setOption = param => newValue => {
    let update = {};
    update[param] = newValue;
    setConversation(prevState => ({
      ...prevState,
      ...update
    }));
  };

  const setTools = newValue => {
    let update = {};
    let current = conversation.tools || [];
    let isSelected = checkIfSelected(newValue);
    let tool = availableTools[availableTools.findIndex(el => el.value === newValue)];
    if (isSelected) {
      update.tools = current.filter(el => el.value !== newValue);
    } else {
      update.tools = [...current, tool];
    }
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
          'pluginOptions flex w-full flex-wrap items-center justify-center gap-2 ' +
          (!advancedMode ? opacityClass : '')
        }
        onMouseEnter={() => {
          if (advancedMode) return;
          setOpacityClass('full-opacity');
        }}
        onMouseLeave={() => {
          if (advancedMode) return;
          if (!messagesTree || messagesTree.length === 0) return;
          setOpacityClass('show');
        }}
      >
        <Button
          type="button"
          className={cn(
            cardStyle,
            'min-w-4 z-50 flex h-[40px] flex-none items-center justify-center px-4 hover:bg-slate-50 focus:ring-0 focus:ring-offset-0 dark:hover:bg-gray-600'
          )}
          onClick={() => setVisibility(prev => !prev)}
        >
          <ChevronDownIcon className={cn(!visibile ? 'rotate-180 transform' : '', 'w-4 text-gray-600 dark:text-white')} />
        </Button>
        <SelectDropDown
          value={model}
          setValue={setOption('model')}
          availableValues={models}
          showAbove={true}
          className={cn(cardStyle, 'min-w-60 z-49 flex w-60', !visibile && 'hidden')}
        />
        <MultiSelectDropDown
          value={conversation.tools || []}
          isSelected={checkIfSelected}
          setValue={setTools}
          availableValues={availableTools}
          showAbove={true}
          className={cn(cardStyle, 'min-w-60 z-50 w-60', !visibile && 'hidden')}
        />
        <Button
          type="button"
          className={cn(
            cardStyle,
            'min-w-4 z-50 flex h-[40px] flex-none items-center justify-center px-4 hover:bg-slate-50 focus:ring-0 focus:ring-offset-0 dark:hover:bg-gray-600',
            !visibile && 'hidden'
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
              endpoint={endpoint}
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

export default PluginsOptions;
