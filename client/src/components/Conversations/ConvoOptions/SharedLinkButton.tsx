import { useEffect, useState, useCallback, useRef } from 'react';
import copy from 'copy-to-clipboard';
import { Copy, Link, QrCode, RotateCw, CopyCheck } from 'lucide-react';
import type { TSharedLinkGetResponse } from 'librechat-data-provider';
import { useCreateSharedLinkMutation, useUpdateSharedLinkMutation } from '~/data-provider';
import { Button, Spinner, TooltipAnchor } from '~/components';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { useLocalize } from '~/hooks';

export default function SharedLinkButton({
  share,
  conversationId,
  showQR,
  setShowQR,
  sharedLink,
  setSharedLink,
}: {
  share: TSharedLinkGetResponse | undefined;
  conversationId: string;
  showQR: boolean;
  setShowQR: (showQR: boolean) => void;
  sharedLink: string;
  setSharedLink: (sharedLink: string) => void;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [isCopying, setIsCopying] = useState(false);
  const copyTimeoutRef = useRef<number | null>(null);
  const shareId = share?.shareId || undefined;

  const { mutate, isLoading: isCreateLoading } = useCreateSharedLinkMutation({
    onError: () => {
      showToast({
        message: localize('com_ui_share_error'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
    },
  });

  const { mutateAsync, isLoading: isUpdateLoading } = useUpdateSharedLinkMutation({
    onError: () => {
      showToast({
        message: localize('com_ui_share_error'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
    },
  });

  const generateShareLink = useCallback((shareId: string) => {
    return `${window.location.protocol}//${window.location.host}/share/${shareId}`;
  }, []);

  const copyLink = () => {
    if (shareId === undefined) {
      return;
    }

    if (typeof copyTimeoutRef.current === 'number') {
      clearTimeout(copyTimeoutRef.current);
    }

    setIsCopying(true);
    copy(sharedLink);
    copyTimeoutRef.current = window.setTimeout(() => {
      setIsCopying(false);
    }, 1500);
  };

  useEffect(() => {
    return () => {
      if (typeof copyTimeoutRef.current === 'number') {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const updateSharedLink = async () => {
    if (shareId === undefined) {
      return;
    }
    const updateShare = await mutateAsync({ shareId });
    const newLink = generateShareLink(updateShare.shareId);
    setSharedLink(newLink);

    if (typeof copyTimeoutRef.current === 'number') {
      clearTimeout(copyTimeoutRef.current);
    }

    setIsCopying(true);
    copy(newLink);
    copyTimeoutRef.current = window.setTimeout(() => {
      setIsCopying(false);
    }, 1500);
  };

  const getHandler = (shareId?: string) => {
    if (shareId === undefined) {
      return {
        handler: async () => {
          mutate({ conversationId });

          setSharedLink(generateShareLink(shareId));
        },
        label: (
          <>
            <Link className="mr-2 size-4" />
            {localize('com_ui_create_link')}
          </>
        ),
      };
    }

    return {
      handler: async () => {
        copyLink();
      },
      label: (
        <>
          <Copy className="mr-2 size-4" />
          {localize('com_ui_copy_link')}
        </>
      ),
    };
  };

  const handlers = getHandler(shareId);

  return (
    <>
      <div className="flex gap-2">
        <Button
          disabled={isCreateLoading || isCopying}
          variant="submit"
          onClick={() => {
            handlers.handler();
          }}
        >
          {!isCopying && !isCreateLoading && handlers.label}
          {isCreateLoading && <Spinner className="size-4" />}
          {isCopying && (
            <>
              <CopyCheck className="size-4" />
              {localize('com_ui_copied')}
            </>
          )}
        </Button>

        {shareId !== undefined && (
          <div className="flex items-center gap-2">
            <TooltipAnchor
              description={localize('com_ui_refresh_link')}
              render={(props) => (
                <Button
                  {...props}
                  onClick={() => updateSharedLink()}
                  variant="outline"
                  disabled={isUpdateLoading}
                >
                  {isUpdateLoading ? (
                    <Spinner className="size-4" />
                  ) : (
                    <RotateCw className="size-4" />
                  )}
                </Button>
              )}
            />

            <TooltipAnchor
              description={showQR ? localize('com_ui_hide_qr') : localize('com_ui_show_qr')}
              render={(props) => (
                <Button {...props} onClick={() => setShowQR(!showQR)} variant="outline">
                  <QrCode className="size-4" />
                </Button>
              )}
            />
          </div>
        )}
      </div>
    </>
  );
}
