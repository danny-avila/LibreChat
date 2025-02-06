import React, { useState, useEffect, useCallback } from 'react';
import {
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  OGDialogTrigger,
  Input,
  Button,
  Spinner,
} from '~/components';
import { QRCodeSVG } from 'qrcode.react';
import { useAuthContext, useLocalize } from '~/hooks';
import { useToastContext } from '~/Providers';
import { Label } from '~/components/ui';
import HoverCardSettings from '../HoverCardSettings';
import {
  useEnableTwoFactorMutation,
  useVerifyTwoFactorMutation,
  useConfirmTwoFactorMutation,
  useDisableTwoFactorMutation,
} from 'librechat-data-provider/react-query';

type Phase = 'verify' | 'backup' | 'disable';

const EnableTwoFactorItem: React.FC = () => {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { showToast } = useToastContext();

  // Local state for controlling the dialog and 2FA setup process.
  const [isDialogOpen, setDialogOpen] = useState<boolean>(false);
  // If 2FA is not enabled, start with "verify" phase; if enabled, start in "disable" phase.
  const [phase, setPhase] = useState<Phase>(user?.totpEnabled ? 'disable' : 'verify');
  const [otpauthUrl, setOtpauthUrl] = useState<string>('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verificationToken, setVerificationToken] = useState<string>('');
  // For the disable flow.
  const [disableToken, setDisableToken] = useState<string>('');
  const [downloaded, setDownloaded] = useState<boolean>(false);

  // Mutation hooks.
  const { mutate: enable2FAMutate } = useEnableTwoFactorMutation();
  const { mutate: verify2FAMutate, isLoading: isVerifying } = useVerifyTwoFactorMutation();
  const { mutate: confirm2FAMutate } = useConfirmTwoFactorMutation();
  const { mutate: disable2FAMutate, isLoading: isDisabling } = useDisableTwoFactorMutation();

  // Reset state when the dialog closes.
  const resetState = useCallback(() => {
    setOtpauthUrl('');
    setBackupCodes([]);
    setVerificationToken('');
    setDisableToken('');
    setPhase(user?.totpEnabled ? 'disable' : 'verify');
    setDownloaded(false);
  }, [user]);

  // When the dialog opens and 2FA is not enabled, automatically generate the 2FA settings.
  useEffect(() => {
    if (isDialogOpen && !user?.totpEnabled && !otpauthUrl) {
      enable2FAMutate(undefined, {
        onSuccess: (data) => {
          setOtpauthUrl(data.otpauthUrl);
          setBackupCodes(data.backupCodes);
          showToast({ message: localize('com_ui_2fa_generated') });
        },
        onError: () => {
          showToast({ message: localize('com_ui_2fa_generate_error'), status: 'error' });
        },
      });
    }
  }, [isDialogOpen, user, otpauthUrl, enable2FAMutate, localize, showToast]);

  // Handler for verifying the TOTP code (for enabling 2FA).
  const handleVerify = useCallback(() => {
    if (!verificationToken) {return;}
    verify2FAMutate({ token: verificationToken }, {
      onSuccess: () => {
        showToast({ message: localize('com_ui_2fa_verified') });
        // Advance to the confirm phase.
        confirm2FAMutate({ token: verificationToken }, {
          onSuccess: () => {
            showToast({ message: localize('com_ui_2fa_enabled') });
            // Advance to the backup phase.
            setPhase('backup');
            // In a full solution, update the user context so that user.totpEnabled becomes true.
          },
          onError: () => {
            showToast({ message: localize('com_ui_2fa_invalid'), status: 'error' });
          },
        });
      },
      onError: () => {
        showToast({ message: localize('com_ui_2fa_invalid'), status: 'error' });
      },
    });
  }, [verificationToken, verify2FAMutate, confirm2FAMutate, localize, showToast]);

  // Handler to download backup codes as a text file.
  const handleDownload = useCallback(() => {
    if (!backupCodes || backupCodes.length === 0) {return;}
    const blob = new Blob([backupCodes.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  }, [backupCodes]);

  // Handler for disabling 2FA.
  const handleDisableVerify = useCallback(() => {
    if (!disableToken) {return;}
    // First, verify the provided token.
    verify2FAMutate({ token: disableToken }, {
      onSuccess: () => {
        // If valid, call the disable endpoint.
        disable2FAMutate(undefined, {
          onSuccess: () => {
            showToast({ message: localize('com_ui_2fa_disabled') });
            setDialogOpen(false);
            // In a full solution, update the user context so that user.totpEnabled becomes false.
          },
          onError: () => {
            showToast({ message: localize('com_ui_2fa_disable_error'), status: 'error' });
          },
        });
      },
      onError: () => {
        showToast({ message: localize('com_ui_2fa_invalid'), status: 'error' });
      },
    });
  }, [disableToken, verify2FAMutate, disable2FAMutate, localize, showToast]);

  // Fallback cancel handler for the disable flow.
  const handleDisableCancel = useCallback(() => {
    showToast({ message: localize('com_ui_2fa_disabled') });
    setDialogOpen(false);
  }, [localize, showToast]);

  return (
    <OGDialog
      open={isDialogOpen}
      onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) {
          resetState();
        }
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Label className="font-light">{localize('com_nav_enable_2fa')}</Label>
          <HoverCardSettings side="bottom" text="com_nav_info_2fa" />
        </div>
        <OGDialogTrigger asChild>
          <Button variant={user?.totpEnabled ? 'default' : 'secondary'} className="w-full">
            {user?.totpEnabled ? localize('com_ui_2fa_enabled') : localize('com_ui_enable_2fa')}
          </Button>
        </OGDialogTrigger>
      </div>
      <OGDialogContent className="w-11/12 max-w-md" style={{ borderRadius: '12px' }}>
        <OGDialogHeader>
          <OGDialogTitle className="text-lg font-medium">
            {user?.totpEnabled ? localize('com_ui_2fa_disable_setup') : localize('com_ui_2fa_setup')}
          </OGDialogTitle>
        </OGDialogHeader>
        {/* Enable Flow */}
        {!user?.totpEnabled && phase === 'verify' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center">
              <p className="text-sm">{localize('com_ui_scan_qr')}</p>
              <div className="mt-2">
                <QRCodeSVG value={otpauthUrl} size={200} />
              </div>
            </div>
            <div className="flex flex-col">
              <label className="mb-1 text-sm">{localize('com_ui_enter_2fa_code')}</label>
              <Input
                value={verificationToken}
                onChange={(e) => setVerificationToken(e.target.value)}
                placeholder={localize('com_ui_2fa_code_placeholder')}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button onClick={handleVerify} disabled={isVerifying || !verificationToken}>
                {isVerifying && <Spinner className="mr-2" />}
                {localize('com_ui_verify')}
              </Button>
            </div>
          </div>
        )}
        {/* Backup Phase */}
        {!user?.totpEnabled && phase === 'backup' && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-medium">{localize('com_ui_backup_codes')}</p>
              <pre className="mt-2 p-2 bg-gray-100 rounded text-sm font-mono">
                {backupCodes.join('\n')}
              </pre>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={handleDownload}>
                {localize('com_ui_download_backup')}
              </Button>
              {/* Once the backup codes are downloaded, the "Done" button simply closes the dialog. */}
              <Button onClick={() => setDialogOpen(false)} disabled={!downloaded}>
                {localize('com_ui_done')}
              </Button>
            </div>
          </div>
        )}
        {/* Disable Flow */}
        {user?.totpEnabled && phase === 'disable' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col">
              <label className="mb-1 text-sm">{localize('com_ui_enter_2fa_code')}</label>
              <Input
                value={disableToken}
                onChange={(e) => setDisableToken(e.target.value)}
                placeholder={localize('com_ui_2fa_code_placeholder')}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button onClick={handleDisableVerify} disabled={!disableToken || isDisabling}>
                {isDisabling && <Spinner className="mr-2" />}
                {localize('com_ui_2fa_disable')}
              </Button>
              <Button onClick={handleDisableCancel}>
                {localize('com_ui_cancel')}
              </Button>
            </div>
          </div>
        )}
      </OGDialogContent>
    </OGDialog>
  );
};

export default React.memo(EnableTwoFactorItem);