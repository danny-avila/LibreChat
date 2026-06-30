import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, CopyCheck } from 'lucide-react';
import {
  Button,
  OGDialog,
  OGDialogTitle,
  OGDialogContent,
  OGDialogDescription,
} from '@librechat/client';
import { useLocalize, useCopyToClipboard } from '~/hooks';
import { cn } from '~/utils';

interface McpOAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverName: string;
  oauthUrl: string;
  canCancel: boolean;
  onCancel: () => void;
}

/**
 * Dedicated second dialog, opened ONLY when connecting an MCP server requires
 * OAuth. Offers three ways to complete the flow: continue in this browser, copy
 * the authorization URL to open elsewhere, or scan a QR code to open it on a
 * phone. Auto-closes once the server connects (the caller derives `open` from
 * connection state).
 */
export default function McpOAuthDialog({
  open,
  onOpenChange,
  serverName,
  oauthUrl,
  canCancel,
  onCancel,
}: McpOAuthDialogProps) {
  const localize = useLocalize();
  const [isCopying, setIsCopying] = useState(false);
  const copyUrl = useCopyToClipboard({ text: oauthUrl });

  if (!oauthUrl) {
    return null;
  }

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="w-11/12 max-w-md overflow-hidden rounded-2xl">
        <OGDialogTitle className="text-base font-semibold text-text-primary">
          {localize('com_nav_mcp_connect_server', { 0: serverName })}
        </OGDialogTitle>
        <OGDialogDescription className="text-sm text-text-secondary">
          {localize('com_ui_mcp_oauth_qr_code_description')}
        </OGDialogDescription>

        <div className="flex flex-col gap-4 p-1">
          <Button
            type="button"
            variant="submit"
            className="w-full"
            onClick={() => window.open(oauthUrl, '_blank', 'noopener,noreferrer')}
          >
            {localize('com_ui_continue_oauth')}
          </Button>

          <div className="flex items-center gap-2 rounded-md bg-surface-secondary p-2">
            <div
              className="min-w-0 flex-1 break-all text-xs text-text-secondary"
              data-testid="mcp-oauth-url"
            >
              {oauthUrl}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={localize('com_ui_copy_link')}
              onClick={() => {
                if (!isCopying) {
                  copyUrl(setIsCopying);
                }
              }}
              className={cn('shrink-0', isCopying && 'cursor-default')}
            >
              {isCopying ? (
                <CopyCheck className="size-4" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
            </Button>
            <span className="sr-only" role="status" aria-live="polite">
              {isCopying ? localize('com_ui_link_copied') : ''}
            </span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="rounded-2xl bg-white p-4 shadow-lg">
              <QRCodeSVG
                value={oauthUrl}
                size={180}
                marginSize={2}
                title={localize('com_ui_mcp_oauth_qr_code_description')}
              />
            </div>
            <span className="text-xs text-text-secondary">
              {localize('com_ui_mcp_oauth_scan_qr')}
            </span>
          </div>

          {canCancel && (
            <Button type="button" variant="outline" className="w-full" onClick={onCancel}>
              {localize('com_ui_cancel')}
            </Button>
          )}
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
