import type { FC } from 'react';
import { DotsIcon } from '~/components/svg';
import { Content, Portal, Root, Trigger } from '@radix-ui/react-popover';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui';

type EditMenuButtonProps = {
  children: React.ReactNode;
};
const EditMenuButton: FC<EditMenuButtonProps> = ({ children }: EditMenuButtonProps) => {
  const localize = useLocalize();

  return (
    <Root>
      <Trigger asChild>
        <div
          className={cn(
            'pointer-cursor relative flex flex-col text-left focus:outline-none focus:ring-0 focus:ring-offset-0 sm:text-sm',
            'hover:text-gray-400 radix-state-open:text-gray-400 dark:hover:text-gray-400 dark:radix-state-open:text-gray-400',
            'z-50 flex h-[40px] min-w-4 flex-none items-center justify-center pr-2 focus:ring-0 focus:ring-offset-0',
          )}
          id="edit-menu-button"
          data-testid="edit-menu-button"
          title={localize('com_endpoint_examples')}
        >
          <TooltipProvider delayDuration={250}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="">
                  <DotsIcon className="h-4 w-4 flex-shrink-0 text-gray-500 hover:text-gray-400 dark:text-gray-300 dark:hover:text-gray-400" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={0}>
                {localize('com_ui_more_options')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </Trigger>
      <Portal>
        <Content
          side="bottom"
          align="start"
          className="mt-2 max-h-[495px] overflow-x-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-700 dark:text-white md:min-w-[200px]"
        >
          {children}
        </Content>
      </Portal>
    </Root>
  );
};

export default EditMenuButton;
