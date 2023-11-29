import { Save } from 'lucide-react';
import { EModelEndpoint } from 'librechat-data-provider';
import { Button } from '~/components/ui';
import { CheckMark, CrossIcon } from '~/components/svg';
// import PopoverButtons from './PopoverButtons';
import type { ReactNode } from 'react';
import { cn, removeFocusOutlines } from '~/utils';
import { useLocalize } from '~/hooks';
// import { unknown } from 'zod';
// import { Content } from '@radix-ui/react-dialog';

type TEndpointOptionsPopoverProps = {
  children: React.ReactNode;
  content: React.ReactNode;
  visible: boolean;
  widget: boolean;
  additionalButton: {
    buttonClass: string;
    handler: () => void;
    icon: React.ReactNode;
    label: string;
  } | null;
  endpoint: EModelEndpoint;
  saveAsPreset: () => void;
  closePopover: () => void;
  PopoverButtons: ReactNode;
};

export default function EndpointOptionsPopover({
  children,
  content,
  // endpoint,
  visible,
  widget = false,
  additionalButton = null,
  saveAsPreset,
  closePopover,
  PopoverButtons,
}: TEndpointOptionsPopoverProps) {
  const localize = useLocalize();
  const cardStyle =
    'shadow-xl rounded-md min-w-[75px] font-normal bg-white border-black/10 border dark:bg-gray-700 text-black dark:text-white';

  return (
    <>
      <div
        className={cn(
          'endpointOptionsPopover-container absolute bottom-[-10px] z-0 flex w-full flex-col items-center md:px-4',
          visible ? ' show' : '',
        )}
      >
        <div
          className={cn(
            cardStyle,
            'border-d-0 flex w-full flex-col overflow-hidden rounded-none border-s-0 border-t bg-white px-0 pb-[10px] dark:border-white/10 md:rounded-md md:border lg:w-[736px]',
          )}
        >
          <div className="flex w-full items-center bg-slate-100 px-2 py-2 dark:bg-gray-800/60">
            <Button
              type="button"
              className="h-auto justify-start bg-transparent px-2 py-1 text-xs font-medium font-normal text-black hover:bg-slate-200 hover:text-black focus:ring-0 dark:bg-transparent dark:text-white dark:hover:bg-gray-700 dark:hover:text-white dark:focus:outline-none dark:focus:ring-offset-0"
              onClick={saveAsPreset}
            >
              {!widget ? (
                <>
                  <Save className="mr-1 w-[14px]" />
                  {localize('com_endpoint_save_as_preset')}
                </>
              ) : (
                <>
                  {/* <CheckMark className="mr-1 w-[14px]" /> */}
                  <CheckMark />
                  {localize('com_endpoint_confirm')}
                </>
              )}
            </Button>
            {additionalButton && (
              <Button
                type="button"
                className={cn(
                  additionalButton.buttonClass,
                  'ml-1 h-auto justify-start bg-transparent px-2 py-1 text-xs font-medium font-normal text-black hover:bg-slate-200 hover:text-black focus:ring-0 focus:ring-offset-0 dark:bg-transparent dark:text-white dark:hover:bg-gray-700 dark:hover:text-white dark:focus:outline-none dark:focus:ring-offset-0',
                )}
                onClick={additionalButton.handler}
              >
                {additionalButton.icon}
                {additionalButton.label}
              </Button>
            )}
            {/* <PopoverButtons endpoint={endpoint} /> */}
            {PopoverButtons}
            <Button
              type="button"
              className={cn(
                'ml-auto h-auto bg-transparent px-3 py-2 text-xs font-medium font-normal text-black hover:bg-slate-200 hover:text-black dark:bg-transparent dark:text-white dark:hover:bg-gray-700 dark:hover:text-white',
                removeFocusOutlines,
              )}
              onClick={closePopover}
            >
              <CrossIcon />
            </Button>
          </div>
          <div>{children}</div>
          <div>{content}</div>
        </div>
      </div>
    </>
  );
}
