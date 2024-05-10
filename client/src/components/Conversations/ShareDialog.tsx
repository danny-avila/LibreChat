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

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="">
      <div className="py-2 text-gray-400">
        {isUpdated ? (
          isNewSharedLink ? (
            localize('com_ui_share_created_message')
          ) : (
            <>{localize('com_ui_share_updated_message')}</>
          )
        ) : share?.isPublic ? (
          localize('com_ui_share_update_message')
        ) : (
          localize('com_ui_share_create_message')
        )}
      </div>
    </div>
  );
}
