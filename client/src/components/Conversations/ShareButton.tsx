import { useState } from 'react';
import {
  Dialog,
  Tooltip,
  DialogTrigger,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '~/components/ui';
import { Share2Icon } from 'lucide-react';
import type { TSharedLink } from 'librechat-data-provider';
import DialogTemplate from '~/components/ui/DialogTemplate';
import SharedLinkButton from './SharedLinkButton';
import ShareDialog from './ShareDialog';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function ShareButton({
  conversationId,
  title,
  className,
  appendLabel = false,
  setPopoverActive,
}: {
  conversationId: string;
  title: string;
  className?: string;
  appendLabel?: boolean;
  setPopoverActive: (isActive: boolean) => void;
}) {
  const localize = useLocalize();
  const [share, setShare] = useState<TSharedLink | null>(null);
  const [open, setOpen] = useState(false);
  const [isUpdated, setIsUpdated] = useState(false);

  const classProp: { className?: string } = {
    className: 'p-1 hover:text-black dark:hover:text-white',
  };
  if (className) {
    classProp.className = className;
  }
  const renderShareButton = () => {
    if (appendLabel) {
      return (
        <>
          <Share2Icon className="h-4 w-4" /> {localize('com_ui_share')}
        </>
      );
    }
    return (
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Share2Icon />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={0}>
            {localize('com_ui_share')}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const buttons = share && (
    <SharedLinkButton
      share={share}
      conversationId={conversationId}
      setShare={setShare}
      isUpdated={isUpdated}
      setIsUpdated={setIsUpdated}
    />
  );

  const onOpenChange = (open: boolean) => {
    setPopoverActive(open);
    setOpen(open);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          className={cn(
            'group m-1.5 flex w-full cursor-pointer items-center gap-2 rounded p-2.5 text-sm hover:bg-gray-200 focus-visible:bg-gray-200 focus-visible:outline-0 radix-disabled:pointer-events-none radix-disabled:opacity-50 dark:hover:bg-gray-600 dark:focus-visible:bg-gray-600',
            className,
          )}
        >
          {renderShareButton()}
        </button>
      </DialogTrigger>
      <DialogTemplate
        buttons={buttons}
        showCloseButton={true}
        showCancelButton={false}
        title={localize('com_ui_share_link_to_chat')}
        className="max-w-[550px]"
        main={
          <>
            <ShareDialog
              setDialogOpen={setOpen}
              conversationId={conversationId}
              title={title}
              share={share}
              setShare={setShare}
              isUpdated={isUpdated}
            />
          </>
        }
      />
    </Dialog>
  );
}
