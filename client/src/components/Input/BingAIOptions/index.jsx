import { useState } from 'react';
import { useRecoilState } from 'recoil';
import { cn } from '~/utils';
import { Button } from '../../ui/Button.tsx';
import { Settings2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '../../ui/Tabs.tsx';
import SelectDropDown from '../../ui/SelectDropDown';
import Settings from '../../Endpoints/BingAI/Settings.jsx';
import EndpointOptionsPopover from '../../Endpoints/EndpointOptionsPopover';
import SaveAsPresetDialog from '../../Endpoints/SaveAsPresetDialog';

import store from '~/store';

function BingAIOptions({ show }) {
  const [conversation, setConversation] = useRecoilState(store.conversation) || {};
  const [advancedMode, setAdvancedMode] = useState(false);
  const [saveAsDialogShow, setSaveAsDialogShow] = useState(false);
  const { endpoint, conversationId } = conversation;
  const { toneStyle, context, systemMessage, jailbreak } = conversation;

  if (endpoint !== 'bingAI') return null;
  if (conversationId !== 'new' && !show) return null;

  const triggerAdvancedMode = () => setAdvancedMode((prev) => !prev);

  const switchToSimpleMode = () => {
    setAdvancedMode(false);
  };

  const saveAsPreset = () => {
    setSaveAsDialogShow(true);
  };

  const setOption = (param) => (newValue) => {
    let update = {};
    update[param] = newValue;
    setConversation((prevState) => ({
      ...prevState,
      ...update
    }));
  };

  const cardStyle =
    'transition-colors shadow-md rounded-md min-w-[75px] font-normal bg-white border-black/10 hover:border-black/10 focus:border-black/10 dark:border-black/10 dark:hover:border-black/10 dark:focus:border-black/10 border dark:bg-gray-700 text-black dark:text-white';
  const defaultClasses =
    'p-2 rounded-md min-w-[75px] font-normal bg-white/[.60] dark:bg-gray-700 text-black text-xs';
  const defaultSelected = cn(
    defaultClasses,
    'font-medium data-[state=active]:text-white text-xs text-white'
  );
  const selectedClass = (val) => val + '-tab ' + defaultSelected;

  return (
    <>
      <div
        className={
          'openAIOptions-simple-container flex w-full flex-wrap items-center justify-center gap-2' +
          (!advancedMode ? ' show' : '')
        }
      >
        <SelectDropDown
          title="Mode"
          value={jailbreak ? 'Sydney' : 'BingAI'}
          setValue={(value) => setOption('jailbreak')(value === 'Sydney')}
          availableValues={['BingAI', 'Sydney']}
          showAbove={true}
          showLabel={false}
          className={cn(
            cardStyle,
            'min-w-36 z-50 flex h-[40px] w-36 flex-none items-center justify-center px-4 ring-0 hover:cursor-pointer hover:bg-slate-50 focus:ring-0 focus:ring-offset-0 data-[state=open]:bg-slate-50 dark:bg-gray-700 dark:hover:bg-gray-600 dark:data-[state=open]:bg-gray-600',
            show ? 'hidden' : null
          )}
        />

        <Tabs
          value={toneStyle}
          className={
            cardStyle +
            ' z-50 flex h-[40px] flex-none items-center justify-center px-0 hover:bg-slate-50 dark:hover:bg-gray-600'
          }
          onValueChange={(value) => setOption('toneStyle')(value.toLowerCase())}
        >
          <TabsList className="bg-white/[.60] dark:bg-gray-700">
            <TabsTrigger
              value="creative"
              className={`${toneStyle === 'creative' ? selectedClass('creative') : defaultClasses}`}
            >
              {'Creative'}
            </TabsTrigger>
            <TabsTrigger
              value="fast"
              className={`${toneStyle === 'fast' ? selectedClass('fast') : defaultClasses}`}
            >
              {'Fast'}
            </TabsTrigger>
            <TabsTrigger
              value="balanced"
              className={`${toneStyle === 'balanced' ? selectedClass('balanced') : defaultClasses}`}
            >
              {'Balanced'}
            </TabsTrigger>
            <TabsTrigger
              value="precise"
              className={`${toneStyle === 'precise' ? selectedClass('precise') : defaultClasses}`}
            >
              {'Precise'}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          type="button"
          className={cn(
            cardStyle,
            'min-w-4 z-50 flex h-[40px] flex-none items-center justify-center px-4 hover:bg-slate-50 focus:ring-0 focus:ring-offset-0 dark:hover:bg-gray-600',
            show ? 'hidden' : null
          )}
          onClick={triggerAdvancedMode}
        >
          <Settings2 className="w-4 text-gray-600 dark:text-white" />
        </Button>
      </div>
      <EndpointOptionsPopover
        content={
          <div className="z-50 px-4 py-4">
            <Settings
              context={context}
              systemMessage={systemMessage}
              jailbreak={jailbreak}
              toneStyle={toneStyle}
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

export default BingAIOptions;
