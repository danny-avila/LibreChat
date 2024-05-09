import type { FC } from 'react';
import { DotsIcon } from '~/components/svg';
import { Content, Portal, Root, Trigger } from '@radix-ui/react-popover';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui';
import { useToggle } from './ToggleContext';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type EditMenuButtonProps = {
  children: React.ReactNode;
};
const EditMenuButton: FC<EditMenuButtonProps> = ({ children }: EditMenuButtonProps) => {
  const localize = useLocalize();
  const { setPopoverActive } = useToggle();

  return (
    <Root onOpenChange={(open) => setPopoverActive(open)}>
      <Trigger asChild>
        <div
          className={cn(
            'pointer-cursor relative flex flex-col text-left focus:outline-none focus:ring-0 focus:ring-offset-0 sm:text-sm',
            'hover:text-gray-400 radix-state-open:text-gray-400 dark:hover:text-gray-400 dark:radix-state-open:text-gray-400',
            'z-50 flex h-[40px] min-w-4 flex-none items-center justify-center focus:ring-0 focus:ring-offset-0',
          )}
          id="edit-menu-button"
          data-testid="edit-menu-button"
          title={localize('com_ui_more_options')}
        >
          <TooltipProvider delayDuration={500}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="">
                  <DotsIcon className="h-[18px] w-[18px] flex-shrink-0 text-gray-500 hover:text-gray-400 dark:text-gray-300 dark:hover:text-gray-400" />
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
          className={cn(
            'popover radix-side-bottom:animate-slideUpAndFade radix-side-left:animate-slideRightAndFade radix-side-right:animate-slideLeftAndFade radix-side-top:animate-slideDownAndFade overflow-hidden rounded-lg shadow-lg',
            'border border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-700 dark:text-white',
            'flex min-w-[200px] max-w-xs flex-wrap',
          )}
        >
          {children}
        </Content>
      </Portal>
    </Root>
  );
};

export default EditMenuButton;
