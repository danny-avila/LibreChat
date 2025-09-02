import { useState, useCallback } from 'react';
import { QrCode, RotateCw, Trash2 } from 'lucide-react';
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
  setSharedLink,
}: {
  share: TSharedLinkGetResponse | undefined;
  conversationId: string;
  setShareDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  showQR: boolean;
  setShowQR: (showQR: boolean) => void;
  setSharedLink: (sharedLink: string) => void;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const shareId = share?.shareId ?? '';

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

  const updateSharedLink = async () => {
    if (!shareId) {
      return;
    }
    const updateShare = await mutateAsync({ shareId });
    const newLink = generateShareLink(updateShare.shareId);
    setSharedLink(newLink);
  };

  const createShareLink = async () => {
    const share = await mutate({ conversationId });
    const newLink = generateShareLink(share.shareId);
    setSharedLink(newLink);
  };

  const handleDelete = async () => {
    if (!shareId) {
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

  return (
    <>
      <div className="flex gap-2">
        {!shareId && (
          <Button disabled={isCreateLoading} variant="submit" onClick={createShareLink}>
            {!isCreateLoading && localize('com_ui_create_link')}
            {isCreateLoading && <Spinner className="size-4" />}
          </Button>
        )}
        {shareId && (
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
