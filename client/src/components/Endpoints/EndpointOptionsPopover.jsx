import React from 'react';
import { Button } from '../ui/Button.tsx';
import CrossIcon from '../svg/CrossIcon';
// import SaveIcon from '../svg/SaveIcon';
import { Save } from 'lucide-react';
import { cn } from '~/utils/';

function EndpointOptionsPopover({
  content,
  visible,
  saveAsPreset,
  switchToSimpleMode,
  additionalButton = null
}) {
  const cardStyle =
    'shadow-md rounded-md min-w-[75px] font-normal bg-white border-black/10 border dark:bg-gray-700 text-black dark:text-white';

  return (
    <>
      <div
        className={
          ' endpointOptionsPopover-container absolute bottom-[-10px] z-0 flex w-full flex-col items-center md:px-4' +
          (visible ? ' show' : '')
        }
      >
        <div
          className={
            cardStyle +
            ' border-d-0 flex w-full flex-col overflow-hidden rounded-none border-s-0 border-t bg-slate-200 px-0 pb-[10px] dark:border-white/10 md:rounded-md md:border lg:w-[736px]'
          }
        >
          <div className="flex w-full items-center bg-slate-100 px-2 py-2 dark:bg-gray-800/60">
            {/* <span className="text-xs font-medium font-normal">Advanced settings for OpenAI endpoint</span> */}
            <Button
              type="button"
              className="h-auto justify-start bg-transparent px-2 py-1 text-xs font-medium font-normal text-black hover:bg-slate-200 hover:text-black focus:ring-0 dark:bg-transparent dark:text-white dark:hover:bg-gray-700 dark:hover:text-white dark:focus:outline-none dark:focus:ring-offset-0"
              onClick={saveAsPreset}
            >
              <Save className="mr-1 w-[14px]" />
              {navigator.languages[0] === 'zh-CN' ? '另存为预设' : 'Save as preset'}
            </Button>
            {additionalButton && (
              <Button
                type="button"
                className={cn(
                  additionalButton.buttonClass,
                  'ml-1 h-auto justify-start bg-transparent px-2 py-1 text-xs font-medium font-normal text-black hover:bg-slate-200 hover:text-black focus:ring-0 focus:ring-offset-0 dark:bg-transparent dark:text-white dark:hover:bg-gray-700 dark:hover:text-white dark:focus:outline-none dark:focus:ring-offset-0'
                )}
                onClick={additionalButton.handler}
              >
                {additionalButton.icon}
                {additionalButton.label}
              </Button>
            )}
            <Button
              type="button"
              className="ml-auto h-auto bg-transparent px-2 py-1 text-xs font-medium font-normal text-black hover:bg-slate-200 hover:text-black focus:ring-offset-0 dark:bg-transparent dark:text-white dark:hover:bg-gray-700 dark:hover:text-white"
              onClick={switchToSimpleMode}
            >
              <CrossIcon className="mr-1" />
              {/* Switch to simple mode */}
            </Button>
          </div>
          <div>{content}</div>
        </div>
      </div>
    </>
  );
}

export default EndpointOptionsPopover;
