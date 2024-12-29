import React, { useState, useEffect } from 'react';
import { OGDialog } from '~/components/ui';
import { useToastContext } from '~/Providers';
import type { TSharedLink } from 'librechat-data-provider';
import { useCreateSharedLinkMutation } from '~/data-provider';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import SharedLinkButton from './SharedLinkButton';
import { NotificationSeverity } from '~/common';
import { Spinner } from '~/components/svg';
import { useLocalize } from '~/hooks';

export default function ShareButton({
  conversationId,
  title,
  showShareDialog,
  setShowShareDialog,
  children,
}: {
  conversationId: string;
  title: string;
  showShareDialog: boolean;
  setShowShareDialog: (value: boolean) => void;
  children?: React.ReactNode;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { mutate, isLoading } = useCreateSharedLinkMutation();
  const [share, setShare] = useState<TSharedLink | null>(null);
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

  if (!conversationId) {
    return null;
  }

  const buttons = share && (
    <SharedLinkButton
      share={share}
      conversationId={conversationId}
      setShare={setShare}
      isUpdated={isUpdated}
      setIsUpdated={setIsUpdated}
    />
  );

  return (
    <OGDialog open={showShareDialog} onOpenChange={setShowShareDialog}>
      {children}
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

                return share?.isPublic === true
                  ? localize('com_ui_share_update_message')
                  : localize('com_ui_share_create_message');
              })()}
            </div>
          </div>
        }
      />
    </OGDialog>
  );
}
