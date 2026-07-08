import type { IntegrationConnectionStatus } from 'librechat-data-provider';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogDescription,
  OGDialogTitle,
  Spinner,
} from '@librechat/client';
import { useLocalize } from '~/hooks';
import { getConnectPromptCopy } from './connectPrompt';
import { IntegrationStatusChip } from './IntegrationStatusChip';

interface ConnectProviderPromptProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  labelKey: string;
  status?: IntegrationConnectionStatus;
  isConnecting?: boolean;
  onConnect: () => void;
  canDisconnect?: boolean;
  isDisconnecting?: boolean;
  onDisconnect?: () => void;
}

export function ConnectProviderPrompt({
  isOpen,
  onOpenChange,
  labelKey,
  status,
  isConnecting = false,
  onConnect,
  canDisconnect = false,
  isDisconnecting = false,
  onDisconnect,
}: ConnectProviderPromptProps) {
  const localize = useLocalize();
  const providerLabel = localize(labelKey as Parameters<typeof localize>[0]);
  const { titleKey, descriptionKey, buttonKey } = getConnectPromptCopy(status);

  return (
    <OGDialog open={isOpen} onOpenChange={onOpenChange}>
      <OGDialogContent className="max-w-md">
        <OGDialogTitle>
          {localize(titleKey as Parameters<typeof localize>[0], { provider: providerLabel })}
        </OGDialogTitle>
        <OGDialogDescription>
          {localize(descriptionKey as Parameters<typeof localize>[0], { provider: providerLabel })}
        </OGDialogDescription>

        <div className="mt-4 flex items-center gap-2">
          <IntegrationStatusChip status={status} />
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <div>
            {canDisconnect && onDisconnect ? (
              <Button
                variant="destructive"
                onClick={onDisconnect}
                disabled={isConnecting || isDisconnecting}
              >
                {isDisconnecting ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    {localize('com_ui_loading')}
                  </>
                ) : (
                  localize('com_integrations_disconnect_button')
                )}
              </Button>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isConnecting || isDisconnecting}
            >
              {localize('com_ui_cancel')}
            </Button>
            <Button variant="submit" onClick={onConnect} disabled={isConnecting || isDisconnecting}>
              {isConnecting ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  {localize('com_ui_loading')}
                </>
              ) : (
                localize(buttonKey as Parameters<typeof localize>[0])
              )}
            </Button>
          </div>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
