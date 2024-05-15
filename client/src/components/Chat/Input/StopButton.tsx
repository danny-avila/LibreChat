import React, { forwardRef } from 'react';
import { useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type StopButtonProps = {
  callback: (e: unknown) => void;
  disabled?: boolean;
};

const StopButton = ({ callback, disabled }: StopButtonProps) => {
  const localize = useLocalize();
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            disabled={disabled}
            className={cn(
              'rounded-full border border-black p-0.5 text-white transition-colors enabled:bg-black disabled:bg-black disabled:text-gray-400 disabled:opacity-10 dark:border-white dark:bg-white dark:disabled:bg-white dark:disabled:opacity-25',
            )}
            onClick={callback}
            data-testid="stop-button"
            type="submit"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="26"
              height="26"
              fill="none"
              viewBox="0 0 24 24"
              // className="icon-lg"
            >
              <rect width="10" height="10" x="7" y="7" fill="currentColor" rx="1.25"></rect>
            </svg>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={10}>
          {localize('com_endpoint_stop')}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default StopButton;
