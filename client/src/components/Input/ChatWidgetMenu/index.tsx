import React, { useState } from 'react';
import SelectDropDown from '../../ui/SelectDropDown';
import { Button } from '../../ui/Button';
import { cn } from '~/utils/';
import WritingAssistant from './WritingAssistant';
import { Settings2 } from 'lucide-react';
import EndpointOptionsPopover from '~/components/Endpoints/EndpointOptionsPopover';

function getWidget(widget: string) {
  if (widget === '写作助手') return <WritingAssistant />;
}

function ChatWidgetMenu() {
  const [chosenWidget, setChosenWidget] = useState<string>('无');
  const [advancedMode, setAdvancedMode] = useState<boolean>(false);
  const widgets = ['无', '写作助手'];
  const widget = getWidget(chosenWidget);

  const cardStyle =
    'transition-colors shadow-md rounded-md min-w-[75px] font-normal bg-white border-black/10 hover:border-black/10 focus:border-black/10 dark:border-black/10 dark:hover:border-black/10 dark:focus:border-black/10 border dark:bg-gray-700 text-black dark:text-white';

  const triggerAdvancedMode = () => setAdvancedMode((prev: boolean) => !prev);
  const switchToSimpleMode = () => {setAdvancedMode(false)};

  return (
    <>
      <div
        className={
          'openAIOptions-simple-container flex w-full flex-wrap items-center justify-start gap-2' +
          (!advancedMode ? ' show' : '')
        }
      >
        <SelectDropDown
          value={chosenWidget}
          setValue={(value: string) => setChosenWidget(value)}
          availableValues={widgets}
          showAbove={true}
          showLabel={false}
          className={cn(
            cardStyle,
            'min-w-48 z-50 flex h-[40px] w-48 flex-none items-center justify-center px-4 ring-0 hover:cursor-pointer hover:bg-slate-50 focus:ring-0 focus:ring-offset-0 data-[state=open]:bg-slate-50 dark:bg-gray-700 dark:hover:bg-gray-600 dark:data-[state=open]:bg-gray-600'
          )} disabled={false} containerClassName={''} subContainerClassName={''}        />
        {chosenWidget === '无' ? null :
          <Button
            type="button"
            className={cn(
              cardStyle,
              'min-w-4 z-50 flex h-[40px] flex-none items-center justify-center px-4 hover:bg-slate-50 focus:ring-0 focus:ring-offset-0 dark:hover:bg-gray-600'
            )}
            onClick={triggerAdvancedMode}
          >
            <Settings2 className="w-4 text-gray-600 dark:text-white" />
          </Button>}
      </div>
      <EndpointOptionsPopover
        content={
          <div className="z-50 px-4 py-4">{widget}</div>
        }
        visible={advancedMode}
        saveAsPreset={null}
        switchToSimpleMode={switchToSimpleMode}
      />
    </>
  );
}

export default ChatWidgetMenu;