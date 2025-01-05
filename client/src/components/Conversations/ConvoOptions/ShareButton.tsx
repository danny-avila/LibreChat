import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useGetSharedLinkQuery } from 'librechat-data-provider/react-query';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import SharedLinkButton from './SharedLinkButton';
import { Spinner, OGDialog } from '~/components';
import { useToastContext } from '~/Providers';
import { useLocalize } from '~/hooks';

export default function ShareButton({
  conversationId,
  title,
  open,
  onOpenChange,
  triggerRef,
  children,
}: {
  conversationId: string;
  title: string;
  open: boolean;
  onOpenChange: React.Dispatch<React.SetStateAction<boolean>>;
  triggerRef?: React.RefObject<HTMLButtonElement>;
  children?: React.ReactNode;
}) {
  const localize = useLocalize();
  const { data: share, isLoading } = useGetSharedLinkQuery(conversationId);
  const [sharedLink, setSharedLink] = useState('');
  const [showQR, setShowQR] = useState(false);

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
        showQR={showQR}
        setShowQR={setShowQR}
        sharedLink={sharedLink}
        setSharedLink={setSharedLink}
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
        className="max-w-[550px]"
        main={
          <div>
            <div className="h-full py-2 text-text-primary">
              {(() => {
                if (isLoading === true) {
                  return <Spinner className="m-auto h-14 animate-spin" />;
                }

                // if (isUpdated) {
                //   return isNewSharedLink
                //     ? localize('com_ui_share_created_message')
                //     : localize('com_ui_share_updated_message');
                // }

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

              <div className="cursor-text break-all text-center text-sm text-text-secondary">
                {sharedLink}
              </div>
            </div>
          </div>
        }
      />
    </OGDialog>
  );
}
