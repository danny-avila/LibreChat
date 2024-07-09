import { useLocalize } from '~/hooks';

import { useCreateSharedLinkMutation } from '~/data-provider';
import { useEffect, useState } from 'react';
import { TSharedLink } from 'librechat-data-provider';
import { useToastContext } from '~/Providers';
import { NotificationSeverity } from '~/common';
import { Spinner } from '~/components/svg';

export default function ShareDialog({
  conversationId,
  title,
  share,
  setShare,
  setDialogOpen,
  isUpdated,
}: {
  conversationId: string;
  title: string;
  share: TSharedLink | null;
  setShare: (share: TSharedLink | null) => void;
  setDialogOpen: (open: boolean) => void;
  isUpdated: boolean;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { mutate, isLoading } = useCreateSharedLinkMutation();
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
        setDialogOpen(false);
      },
    });

    // mutation.mutate should only be called once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
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
  );
}
