import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, CopyCheck } from 'lucide-react';
import { useGetSharedLinkQuery } from 'librechat-data-provider/react-query';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { useLocalize, useCopyToClipboard } from '~/hooks';
import { Button, Spinner, OGDialog } from '~/components';
import SharedLinkButton from './SharedLinkButton';
import { cn } from '~/utils';

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
  const [showQR, setShowQR] = useState(false);
  const [sharedLink, setSharedLink] = useState('');
  const [isCopying, setIsCopying] = useState(false);
  const { data: share, isLoading } = useGetSharedLinkQuery(conversationId);
  const copyLink = useCopyToClipboard({ text: sharedLink });

  useEffect(() => {
    if (share?.shareId !== undefined) {
      const link = `${window.location.protocol}//${window.location.host}/share/${share.shareId}`;
      setSharedLink(link);
    }
  }, [share]);

  const button =
    isLoading === true ? null : (
      <SharedLinkButton
        share={share}
        conversationId={conversationId}
        setShareDialogOpen={onOpenChange}
        showQR={showQR}
        setShowQR={setShowQR}
        setSharedLink={setSharedLink}
      />
    );

  const shareId = share?.shareId ?? '';

  return (
    <OGDialog open={open} onOpenChange={onOpenChange} triggerRef={triggerRef}>
      {children}
      <OGDialogTemplate
        buttons={button}
        showCloseButton={true}
        showCancelButton={false}
        title={localize('com_ui_share_link_to_chat')}
        className="max-w-[550px]"
        main={
          <div>
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
            <div className="relative items-center rounded-lg p-2">
              {showQR && (
                <div className="mb-4 flex flex-col items-center">
                  <QRCodeSVG value={sharedLink} size={200} marginSize={2} className="rounded-2xl" />
                </div>
              )}

              {shareId && (
                <div className="flex items-center gap-2 rounded-md bg-surface-secondary p-2">
                  <div className="flex-1 break-all text-sm text-text-secondary">{sharedLink}</div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (isCopying) {
                        return;
                      }
                      copyLink(setIsCopying);
                    }}
                    className={cn('shrink-0', isCopying ? 'cursor-default' : '')}
                  >
                    {isCopying ? <CopyCheck className="size-4" /> : <Copy className="size-4" />}
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
