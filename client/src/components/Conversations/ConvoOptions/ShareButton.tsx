import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, CopyCheck } from 'lucide-react';
import { useGetSharedLinkQuery } from 'librechat-data-provider/react-query';
import { OGDialogTemplate, Button, Spinner, OGDialog, Checkbox, Label } from '@librechat/client';
import { useLatestMessageId } from '~/hooks/Messages/useLatestMessage';
import { useLocalize, useCopyToClipboard } from '~/hooks';
import { useGetStartupConfig } from '~/data-provider';
import SharedLinkButton from './SharedLinkButton';
import { buildShareLinkUrl, cn } from '~/utils';

export default function ShareButton({
  conversationId,
  open,
  onOpenChange,
  triggerRef,
  children,
}: {
  conversationId: string;
  open: boolean;
  onOpenChange: React.Dispatch<React.SetStateAction<boolean>>;
  triggerRef?: React.RefObject<HTMLButtonElement>;
  children?: React.ReactNode;
}) {
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();
  const canSnapshotFiles = startupConfig?.sharedLinksSnapshotFilesEnabled === true;
  const [showQR, setShowQR] = useState(false);
  const [sharedLink, setSharedLink] = useState('');
  const [snapshotFiles, setSnapshotFiles] = useState(true);
  const [isCopying, setIsCopying] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const copyLink = useCopyToClipboard({ text: sharedLink });
  const copyLinkAndAnnounce = (setIsCopying: React.Dispatch<React.SetStateAction<boolean>>) => {
    setAnnouncement(localize('com_ui_link_copied'));
    copyLink(setIsCopying);
    setTimeout(() => {
      setAnnouncement('');
    }, 1000);
  };
  const latestMessageId = useLatestMessageId(0);
  const { data: share, isLoading } = useGetSharedLinkQuery(conversationId);
  const shareId = share?.shareId ?? '';

  useEffect(() => {
    if (shareId) {
      setSharedLink(buildShareLinkUrl(shareId));
    }
  }, [shareId]);

  // Reflect an existing link's stored "share files" choice so the checkbox isn't
  // misleading (legacy links have no stored choice → keep the default of enabled).
  useEffect(() => {
    if (share?.success === true && typeof share.snapshotFiles === 'boolean') {
      setSnapshotFiles(share.snapshotFiles);
    }
  }, [share?.success, share?.snapshotFiles]);

  const button =
    isLoading === true ? null : (
      <SharedLinkButton
        share={share}
        conversationId={conversationId}
        targetMessageId={latestMessageId ?? undefined}
        showQR={showQR}
        setShowQR={setShowQR}
        setSharedLink={setSharedLink}
        snapshotFiles={canSnapshotFiles ? snapshotFiles : undefined}
      />
    );

  return (
    <OGDialog open={open} onOpenChange={onOpenChange} triggerRef={triggerRef}>
      {children}
      <OGDialogTemplate
        buttons={button}
        showCloseButton={true}
        showCancelButton={false}
        title={localize('com_ui_share_link_to_chat')}
        className="max-h-[90vh] max-w-[550px] overflow-y-auto"
        main={
          <div id="share-conversation-dialog">
            <div className="h-full py-2 text-text-primary">
              {(() => {
                if (isLoading === true) {
                  return <Spinner className="m-auto h-14 animate-spin" />;
                }

                return share?.success === true
                  ? localize('com_ui_share_update_message')
                  : localize('com_ui_share_create_message');
              })()}
            </div>
            {canSnapshotFiles && isLoading !== true && (
              <div className="flex items-start gap-3 px-2 py-2">
                <Checkbox
                  id="share-files-checkbox"
                  checked={snapshotFiles}
                  onCheckedChange={(checked) => setSnapshotFiles(checked === true)}
                  aria-label={localize('com_ui_share_files')}
                  className="mt-0.5"
                />
                <div className="flex flex-col gap-0.5">
                  <Label
                    htmlFor="share-files-checkbox"
                    className="cursor-pointer text-sm font-medium text-text-primary"
                  >
                    {localize('com_ui_share_files')}
                  </Label>
                  <span className="text-xs text-text-secondary">
                    {localize('com_ui_share_files_description')}
                  </span>
                  {shareId && (
                    <span className="text-xs font-medium text-text-secondary">
                      {localize('com_ui_share_files_refresh_note')}
                    </span>
                  )}
                </div>
              </div>
            )}
            <div className="relative items-center overflow-auto rounded-lg p-2">
              {showQR && (
                <div className="mb-4 flex flex-col items-center">
                  <QRCodeSVG
                    value={sharedLink}
                    size={200}
                    marginSize={2}
                    className="rounded-2xl"
                    title={localize('com_ui_share_qr_code_description')}
                  />
                </div>
              )}

              {shareId && (
                <div className="flex items-center gap-2 rounded-md bg-surface-secondary p-2">
                  <div
                    className="flex-1 break-all text-sm text-text-secondary"
                    data-testid="shared-link-url"
                  >
                    {sharedLink}
                  </div>
                  <span className="sr-only" aria-live="polite" aria-atomic="true">
                    {announcement}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={localize('com_ui_copy_link')}
                    onClick={() => {
                      if (isCopying) {
                        return;
                      }
                      copyLinkAndAnnounce(setIsCopying);
                    }}
                    className={cn('shrink-0', isCopying ? 'cursor-default' : '')}
                  >
                    {isCopying ? (
                      <CopyCheck className="size-4" aria-hidden="true" />
                    ) : (
                      <Copy className="size-4" aria-hidden="true" />
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        }
      />
    </OGDialog>
  );
}
