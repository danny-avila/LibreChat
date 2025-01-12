import copy from 'copy-to-clipboard';
import { useEffect, useState, useCallback, useRef } from 'react';
import { Copy, Link, QrCode, RotateCw, CopyCheck, Trash2 } from 'lucide-react';
import type { TSharedLinkGetResponse } from 'librechat-data-provider';
import {
  useCreateSharedLinkMutation,
  useUpdateSharedLinkMutation,
  useDeleteSharedLinkMutation,
} from '~/data-provider';
import { Button, OGDialog, Spinner, TooltipAnchor, Label } from '~/components';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { useLocalize } from '~/hooks';

export default function SharedLinkButton({
  share,
  conversationId,
  setShareDialogOpen,
  showQR,
  setShowQR,
  sharedLink,
  setSharedLink,
}: {
  share: TSharedLinkGetResponse | undefined;
  conversationId: string;
  setShareDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  showQR: boolean;
  setShowQR: (showQR: boolean) => void;
  sharedLink: string;
  setSharedLink: (sharedLink: string) => void;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [isCopying, setIsCopying] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const copyTimeoutRef = useRef<number | null>(null);
  const shareId = share?.shareId || undefined;

  const { mutateAsync: mutate, isLoading: isCreateLoading } = useCreateSharedLinkMutation({
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

  const deleteMutation = useDeleteSharedLinkMutation({
    onSuccess: async () => {
      setShowDeleteDialog(false);
      setShareDialogOpen(false);
    },
    onError: (error) => {
      console.error('Delete error:', error);
      showToast({
        message: localize('com_ui_share_delete_error'),
        severity: NotificationSeverity.ERROR,
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

  const createShareLink = async () => {
    const share = await mutate({ conversationId });
    const newLink = generateShareLink(share.shareId);
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

  const handleDelete = async () => {
    if (shareId === undefined) {
      return;
    }

    try {
      await deleteMutation.mutateAsync({ shareId });
      showToast({
        message: localize('com_ui_shared_link_delete_success'),
        severity: NotificationSeverity.SUCCESS,
      });
    } catch (error) {
      console.error('Failed to delete shared link:', error);
      showToast({
        message: localize('com_ui_share_delete_error'),
        severity: NotificationSeverity.ERROR,
      });
    }
  };

  const getHandler = (shareId?: string) => {
    if (shareId === undefined) {
      return {
        handler: async () => {
          createShareLink();
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

            <TooltipAnchor
              description={localize('com_ui_delete')}
              render={(props) => (
                <Button {...props} onClick={() => setShowDeleteDialog(true)} variant="destructive">
                  <Trash2 className="size-4" />
                </Button>
              )}
            />
          </div>
        )}

        <OGDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <OGDialogTemplate
            showCloseButton={false}
            title={localize('com_ui_delete_shared_link')}
            className="max-w-[450px]"
            main={
              <>
                <div className="flex w-full flex-col items-center gap-2">
                  <div className="grid w-full items-center gap-2">
                    <Label
                      htmlFor="dialog-confirm-delete"
                      className="text-left text-sm font-medium"
                    >
                      {localize('com_ui_delete_confirm')} <strong>&quot;{shareId}&quot;</strong>
                    </Label>
                  </div>
                </div>
              </>
            }
            selection={{
              selectHandler: handleDelete,
              selectClasses:
                'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
              selectText: localize('com_ui_delete'),
            }}
          />
        </OGDialog>
      </div>
    </>
  );
}
