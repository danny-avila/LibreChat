import React from 'react';
import { Button } from '../ui/Button.tsx';
import SwitchIcon from '../svg/SwitchIcon';
// import SaveIcon from '../svg/SaveIcon';
import { Save } from 'lucide-react';

function EndpointOptionsPopover({ content, visible, saveAsPreset, switchToSimpleMode }) {
  const cardStyle =
    'shadow-md rounded-md min-w-[75px] font-normal bg-white border-black/10 border dark:bg-gray-700 text-black dark:text-white';

  return (
    <>
      <div
        className={
          ' endpointOptionsPopover-container absolute bottom-[-10px] flex w-full flex-col items-center justify-center md:px-4' +
          (visible ? ' show' : '')
        }
      >
        <div
          className={
            cardStyle +
            ' border-s-0 border-d-0 flex w-full flex-col overflow-hidden rounded-none border-t bg-slate-200 px-0 pb-[10px] dark:border-white/10 md:rounded-md md:border lg:w-[736px]'
          }
        >
          <div className="flex w-full items-center justify-between bg-slate-100 px-2 py-2 dark:bg-gray-800/60">
            {/* <span className="text-xs font-medium font-normal">Advanced settings for OpenAI endpoint</span> */}
            <Button
              type="button"
              className="h-auto bg-transparent px-2 py-1 text-xs font-medium font-normal text-black hover:bg-slate-200 hover:text-black dark:bg-transparent dark:text-white dark:hover:bg-gray-700 dark:hover:text-white"
              onClick={saveAsPreset}
            >
              <Save className="mr-1 w-[14px]" />
              Save as preset
            </Button>
            <Button
              type="button"
              className="h-auto bg-transparent px-2 py-1 text-xs font-medium font-normal text-black hover:bg-slate-200 hover:text-black dark:bg-transparent dark:text-white dark:hover:bg-gray-700 dark:hover:text-white"
              onClick={switchToSimpleMode}
            >
              <SwitchIcon className="mr-1" />
              Switch to simple mode
            </Button>
          </div>
          <div>{content}</div>
        </div>
      </div>
    </>
  );
}

export default EndpointOptionsPopover;
