import { useState, useEffect } from 'react';
import {
  OGDialog,
  Tooltip,
  OGDialogTrigger,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '~/components/ui';
import { Share2Icon } from 'lucide-react';
import { useToastContext } from '~/Providers';
import type { TSharedLink } from 'librechat-data-provider';
import { useCreateSharedLinkMutation } from '~/data-provider';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import SharedLinkButton from './SharedLinkButton';
import { NotificationSeverity } from '~/common';
import { Spinner } from '~/components/svg';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function ShareButton({
  children,
  conversationId,
  title,
  setPopoverActive,
}: {
  children?: React.ReactNode;
  conversationId: string;
  title: string;
  setPopoverActive: (isActive: boolean) => void;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { mutate, isLoading } = useCreateSharedLinkMutation();
  const [share, setShare] = useState<TSharedLink | null>(null);
  const [open, setOpen] = useState(false);
  const [isUpdated, setIsUpdated] = useState(false);
  const [isNewSharedLink, setIsNewSharedLink] = useState(false);

  useEffect(() => {
    if (isLoading || share) {
      return;
    }
    const data = {
      conversationId,
      title,
      isAnonymous: true,
    };

    mutate(data, {
      onSuccess: (result) => {
        setShare(result);
        setIsNewSharedLink(!result.isPublic);
      },
      onError: () => {
        showToast({
          message: localize('com_ui_share_error'),
          severity: NotificationSeverity.ERROR,
          showIcon: true,
        });
      },
    });

    // mutation.mutate should only be called once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    console.log('onOpenChange called with:', open);
    setPopoverActive(open);
    setOpen(open);
  };

  const renderShareDialog = (
    <OGDialogTemplate
      buttons={buttons}
      showCloseButton={true}
      showCancelButton={false}
      title={localize('com_ui_share_link_to_chat')}
      className="max-w-[550px]"
      main={
        <div>
          <div className="h-full py-2 text-gray-400 dark:text-gray-200">
            {(() => {
              if (isLoading) {
                return <Spinner className="m-auto h-14 animate-spin" />;
              }

              if (isUpdated) {
                return isNewSharedLink
                  ? localize('com_ui_share_created_message')
                  : localize('com_ui_share_updated_message');
              }

              return share?.isPublic
                ? localize('com_ui_share_update_message')
                : localize('com_ui_share_create_message');
            })()}
          </div>
        </div>
      }
    />
  );

  if (children) {
    return (
      <OGDialog open={open} onOpenChange={onOpenChange}>
        <OGDialogTrigger asChild>{children}</OGDialogTrigger>
        {renderShareDialog}
      </OGDialog>
    );
  }
  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogTrigger asChild>
        <button
          className={cn(
            'group m-1.5 flex w-full cursor-pointer items-center gap-2 rounded p-2.5 text-sm hover:bg-gray-200 focus-visible:bg-gray-200 focus-visible:outline-0 radix-disabled:pointer-events-none radix-disabled:opacity-50 dark:hover:bg-gray-600 dark:focus-visible:bg-gray-600',
          )}
        >
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
        </button>
      </OGDialogTrigger>
      {renderShareDialog}
    </OGDialog>
  );
}
