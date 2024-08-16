import { useState } from 'react';
import copy from 'copy-to-clipboard';
import { Copy, Link } from 'lucide-react';
import type { TSharedLink } from 'librechat-data-provider';
import { useUpdateSharedLinkMutation } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { Spinner } from '~/components/svg';
import { Button } from '~/components/ui';
import { useLocalize } from '~/hooks';

export default function SharedLinkButton({
  conversationId,
  share,
  setShare,
  isUpdated,
  setIsUpdated,
}: {
  conversationId: string;
  share: TSharedLink;
  setShare: (share: TSharedLink) => void;
  isUpdated: boolean;
  setIsUpdated: (isUpdated: boolean) => void;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [isCopying, setIsCopying] = useState(false);

  const { mutateAsync, isLoading } = useUpdateSharedLinkMutation({
    onError: () => {
      showToast({
        message: localize('com_ui_share_error'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
    },
  });

  const copyLink = () => {
    if (!share) {
      return;
    }
    setIsCopying(true);
    const sharedLink =
      window.location.protocol + '//' + window.location.host + '/share/' + share.shareId;
    copy(sharedLink);
    setTimeout(() => {
      setIsCopying(false);
    }, 1500);
  };
  const updateSharedLink = async () => {
    if (!share) {
      return;
    }
    const result = await mutateAsync({
      shareId: share.shareId,
      conversationId: conversationId,
      isPublic: true,
      isVisible: true,
      isAnonymous: true,
    });

    if (result) {
      setShare(result);
      setIsUpdated(true);
      copyLink();
    }
  };
  const getHandler = () => {
    if (isUpdated) {
      return {
        handler: () => {
          copyLink();
        },
        label: (
          <>
            <Copy className="mr-2 h-4 w-4" />
            {localize('com_ui_copy_link')}
          </>
        ),
      };
    }
    if (share.isPublic) {
      return {
        handler: async () => {
          await updateSharedLink();
        },

        label: (
          <>
            <Link className="mr-2 h-4 w-4" />
            {localize('com_ui_update_link')}
          </>
        ),
      };
    }
    return {
      handler: updateSharedLink,
      label: (
        <>
          <Link className="mr-2 h-4 w-4" />
          {localize('com_ui_create_link')}
        </>
      ),
    };
  };

  const handlers = getHandler();
  return (
    <button
      disabled={isLoading || isCopying}
      onClick={() => {
        handlers.handler();
      }}
      className="btn btn-primary flex items-center"
    >
      {isCopying && (
        <>
          <Copy className="mr-2 h-4 w-4" />
          {localize('com_ui_copied')}
        </>
      )}
      {!isCopying && !isLoading && handlers.label}
      {!isCopying && isLoading && <Spinner className="h-4 w-4" />}
    </button>
  );
}
