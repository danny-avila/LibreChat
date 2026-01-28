import { useState, useRef } from 'react';
import { Trans } from 'react-i18next';
import { QrCode, RotateCw, Trash2 } from 'lucide-react';
import {
  Label,
  Button,
  Spinner,
  OGDialog,
  OGDialogClose,
  TooltipAnchor,
  OGDialogTitle,
  OGDialogHeader,
  useToastContext,
  OGDialogContent,
} from '@librechat/client';
import type { TSharedLinkGetResponse } from 'librechat-data-provider';
import {
  useCreateSharedLinkMutation,
  useUpdateSharedLinkMutation,
  useDeleteSharedLinkMutation,
} from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { buildShareLinkUrl } from '~/utils';
import { useLocalize } from '~/hooks';

export default function SharedLinkButton({
  share,
  conversationId,
  targetMessageId,
  showQR,
  setShowQR,
  setSharedLink,
}: {
  share: TSharedLinkGetResponse | undefined;
  conversationId: string;
  targetMessageId?: string;
  showQR: boolean;
  setShowQR: (showQR: boolean) => void;
  setSharedLink: (sharedLink: string) => void;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [announcement, setAnnouncement] = useState('');
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
    onSuccess: () => {
      setShowDeleteDialog(false);
      setTimeout(() => {
        const dialog = document
          .getElementById('share-conversation-dialog')
          ?.closest('[role="dialog"]');
        if (dialog instanceof HTMLElement) {
          dialog.focus();
        }
      }, 0);
    },
    onError: (error) => {
      console.error('Delete error:', error);
      showToast({
        message: localize('com_ui_share_delete_error'),
        severity: NotificationSeverity.ERROR,
      });
    },
  });

  const generateShareLink = (shareId: string) => buildShareLinkUrl(shareId);

  const updateSharedLink = async () => {
    if (!shareId) {
      return;
    }
    const updateShare = await mutateAsync({ shareId });
    const newLink = generateShareLink(updateShare.shareId);
    setSharedLink(newLink);
    setAnnouncement(localize('com_ui_link_refreshed'));
    setTimeout(() => {
      setAnnouncement('');
    }, 1000);
  };

  const createShareLink = async () => {
    const share = await mutate({ conversationId, targetMessageId });
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

  const qrCodeLabel = showQR ? localize('com_ui_hide_qr') : localize('com_ui_show_qr');

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
                <>
                  <span className="sr-only" aria-live="polite" aria-atomic="true">
                    {announcement}
                  </span>
                  <Button
                    {...props}
                    onClick={() => updateSharedLink()}
                    variant="outline"
                    disabled={isUpdateLoading}
                    aria-label={localize('com_ui_refresh_link')}
                  >
                    {isUpdateLoading ? (
                      <Spinner className="size-4" />
                    ) : (
                      <RotateCw className="size-4" aria-hidden="true" />
                    )}
                  </Button>
                </>
              )}
            />

            <TooltipAnchor
              description={qrCodeLabel}
              render={(props) => (
                <Button
                  {...props}
                  onClick={() => setShowQR(!showQR)}
                  variant="outline"
                  aria-label={qrCodeLabel}
                >
                  <QrCode className="size-4" aria-hidden="true" />
                </Button>
              )}
            />

            <TooltipAnchor
              description={localize('com_ui_delete')}
              render={(props) => (
                <Button
                  {...props}
                  ref={deleteButtonRef}
                  onClick={() => setShowDeleteDialog(true)}
                  variant="destructive"
                  aria-label={localize('com_ui_delete')}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              )}
            />
          </div>
        )}
        <OGDialog
          open={showDeleteDialog}
          triggerRef={deleteButtonRef}
          onOpenChange={setShowDeleteDialog}
        >
          <OGDialogContent className="max-w-[450px]" showCloseButton={false}>
            <OGDialogHeader>
              <OGDialogTitle>{localize('com_ui_delete_shared_link_heading')}</OGDialogTitle>
            </OGDialogHeader>
            <div className="flex w-full flex-col items-center gap-2">
              <div className="grid w-full items-center gap-2">
                <Label htmlFor="dialog-confirm-delete" className="text-left text-sm font-medium">
                  <Trans
                    i18nKey="com_ui_delete_confirm_strong"
                    values={{ title: shareId }}
                    components={{ strong: <strong /> }}
                  />
                </Label>
              </div>
            </div>
            <div className="flex justify-end gap-4 pt-4">
              <OGDialogClose asChild>
                <Button variant="outline">{localize('com_ui_cancel')}</Button>
              </OGDialogClose>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteMutation.isLoading}
              >
                {deleteMutation.isLoading ? (
                  <Spinner className="size-4" />
                ) : (
                  localize('com_ui_delete')
                )}
              </Button>
            </div>
          </OGDialogContent>
        </OGDialog>
      </div>
    </>
  );
}
