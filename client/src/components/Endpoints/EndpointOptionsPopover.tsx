import { Save } from 'lucide-react';
import type { ReactNode } from 'react';
// import { EModelEndpoint } from 'librechat-data-provider';
import { cn, removeFocusOutlines } from '~/utils';
// import PopoverButtons from './PopoverButtons';
import { CrossIcon } from '~/components/svg';
import { Button } from '~/components/ui';
import { useLocalize } from '~/hooks';

type TEndpointOptionsPopoverProps = {
  children: ReactNode;
  visible: boolean;
  // endpoint: EModelEndpoint;
  saveAsPreset: () => void;
  closePopover: () => void;
  PopoverButtons: ReactNode;
};

export default function EndpointOptionsPopover({
  children,
  // endpoint,
  visible,
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
              <Save className="mr-1 w-[14px]" />
              {localize('com_endpoint_save_as_preset')}
            </Button>
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
        </div>
      </div>
    </>
  );
}
