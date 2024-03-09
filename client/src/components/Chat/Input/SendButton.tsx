import { SendIcon } from '~/components/svg';
import { cn } from '~/utils';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui/';
import { useLocalize } from '~/hooks';

export default function SendButton({ text, disabled }) {
  const localize = useLocalize();

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            disabled={!text || disabled}
            className={cn(
              'absolute bottom-1.5 right-2 rounded-lg border border-black p-0.5 text-white transition-colors enabled:bg-black disabled:bg-black disabled:text-gray-400 disabled:opacity-10 dark:border-white dark:bg-white dark:disabled:bg-white md:bottom-3 md:right-3',
            )}
            data-testid="send-button"
            type="submit"
          >
            <span className="" data-state="closed">
              <SendIcon size={24} />
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={10}>
          {localize('com_nav_send_message')}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
