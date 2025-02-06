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
  Label,
} from '~/components';
import { QRCodeSVG } from 'qrcode.react';
import { useAuthContext, useLocalize } from '~/hooks';
import { useToastContext } from '~/Providers';
import { useSetRecoilState } from 'recoil';
import store from '~/store';
import HoverCardSettings from '../HoverCardSettings';
import {
  useEnableTwoFactorMutation,
  useVerifyTwoFactorMutation,
  useConfirmTwoFactorMutation,
  useDisableTwoFactorMutation,
} from 'librechat-data-provider/react-query';
import type { TUser } from 'librechat-data-provider';

type Phase = 'verify' | 'backup' | 'disable';

const TwoFactorAuthentication: React.FC = () => {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const setUser = useSetRecoilState(store.user);
  const { showToast } = useToastContext();

  const [isDialogOpen, setDialogOpen] = useState<boolean>(false);
  const [phase, setPhase] = useState<Phase>(user?.totpEnabled ? 'disable' : 'verify');
  const [otpauthUrl, setOtpauthUrl] = useState<string>('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verificationToken, setVerificationToken] = useState<string>('');
  const [disableToken, setDisableToken] = useState<string>('');
  const [downloaded, setDownloaded] = useState<boolean>(false);

  const { mutate: enable2FAMutate } = useEnableTwoFactorMutation();
  const { mutate: verify2FAMutate, isLoading: isVerifying } = useVerifyTwoFactorMutation();
  const { mutate: confirm2FAMutate } = useConfirmTwoFactorMutation();
  const { mutate: disable2FAMutate, isLoading: isDisabling } = useDisableTwoFactorMutation();

  // Reset state when closing the dialog and cleanup if unfinished
  const resetState = useCallback(() => {
    if (!user?.totpEnabled && otpauthUrl) {
      // Cleanup unfinished setup when the dialog is closed before verification
      disable2FAMutate(undefined, {
        onSuccess: () => {
          showToast({ message: localize('com_ui_2fa_canceled') });
        },
        onError: () => showToast({ message: localize('com_ui_2fa_disable_error'), status: 'error' }),
      });
    }

    setOtpauthUrl('');
    setBackupCodes([]);
    setVerificationToken('');
    setDisableToken('');
    setPhase(user?.totpEnabled ? 'disable' : 'verify');
    setDownloaded(false);
  }, [user, otpauthUrl, disable2FAMutate, localize, showToast]);

  useEffect(() => {
    if (
      isDialogOpen &&
        !user?.totpEnabled &&
        !otpauthUrl &&
        phase !== 'disable'
    ) {
      enable2FAMutate(undefined, {
        onSuccess: ({ otpauthUrl, backupCodes }) => {
          setOtpauthUrl(otpauthUrl);
          setBackupCodes(backupCodes);
          showToast({ message: localize('com_ui_2fa_generated') });
        },
        onError: () => showToast({ message: localize('com_ui_2fa_generate_error'), status: 'error' }),
      });
    }
  }, [isDialogOpen, user?.totpEnabled, otpauthUrl, enable2FAMutate, localize, showToast, phase]);

  // Enable 2FA
  const handleVerify = useCallback(() => {
    if (!verificationToken) { return; }

    verify2FAMutate({ token: verificationToken }, {
      onSuccess: () => {
        showToast({ message: localize('com_ui_2fa_verified') });

        confirm2FAMutate({ token: verificationToken }, {
          onSuccess: () => {
            setPhase('backup');
          },
          onError: () => showToast({ message: localize('com_ui_2fa_invalid'), status: 'error' }),
        });
      },
      onError: () => showToast({ message: localize('com_ui_2fa_invalid'), status: 'error' }),
    });
  }, [verificationToken, verify2FAMutate, confirm2FAMutate, localize, showToast]);

  // Download backup codes
  const handleDownload = useCallback(() => {
    if (!backupCodes.length) { return; }

    const blob = new Blob([backupCodes.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  }, [backupCodes]);

  // Enable 2FA complete confirmation
  const handleConfirm = useCallback(() => {
    setDialogOpen(false);
    showToast({ message: localize('com_ui_2fa_enabled') });
    setUser((prev) => ({ ...prev, totpEnabled: true } as TUser));
  }, [setUser, localize, showToast]);

  // Disable 2FA
  const handleDisableVerify = useCallback(() => {
    if (!disableToken) { return; }

    verify2FAMutate({ token: disableToken }, {
      onSuccess: () => {
        disable2FAMutate(undefined, {
          onSuccess: () => {
            showToast({ message: localize('com_ui_2fa_disabled') });
            setDialogOpen(false);
            setUser((prev) => ({ ...prev, totpEnabled: false, totpSecret: '', backupCodes: [] } as TUser));
            setPhase('verify'); // Ensure it does not trigger re-enabling
            setOtpauthUrl(''); // Clear state after disabling
          },
          onError: () => showToast({ message: localize('com_ui_2fa_disable_error'), status: 'error' }),
        });
      },
      onError: () => showToast({ message: localize('com_ui_2fa_invalid'), status: 'error' }),
    });
  }, [disableToken, verify2FAMutate, disable2FAMutate, setUser, localize, showToast]);

  return (
    <OGDialog
      open={isDialogOpen}
      onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) { resetState(); }
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Label className="font-light">{localize('com_nav_enable_2fa')}</Label>
          <HoverCardSettings side="bottom" text="com_nav_info_2fa" />
        </div>
        <OGDialogTrigger asChild>
          <Button variant={user?.totpEnabled ? 'default' : 'secondary'} disabled={isVerifying || isDisabling}>
            {user?.totpEnabled ? localize('com_ui_2fa_disable') : localize('com_ui_2fa_enable')}
          </Button>
        </OGDialogTrigger>
      </div>
      <OGDialogContent className="w-11/12 max-w-md rounded-xl">
        <OGDialogHeader>
          <OGDialogTitle className="text-lg font-medium">
            {localize(user?.totpEnabled ? 'com_ui_2fa_disable_setup' : 'com_ui_2fa_setup')}
          </OGDialogTitle>
        </OGDialogHeader>

        {/* Enable 2FA */}
        {!user?.totpEnabled && phase === 'verify' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm">{localize('com_ui_scan_qr')}</p>
            <QRCodeSVG value={otpauthUrl} size={200} className="self-center mt-2" />
            <Input
              value={verificationToken}
              onChange={(e) => setVerificationToken(e.target.value)}
              placeholder={localize('com_ui_2fa_code_placeholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleVerify();
                }
              }}
            />
            <Button onClick={handleVerify} disabled={isVerifying || !verificationToken}>
              {isVerifying && <Spinner className="mr-2" />}
              {localize('com_ui_verify')}
            </Button>
          </div>
        )}

        {/* Backup codes */}
        {!user?.totpEnabled && phase === 'backup' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-medium">{localize('com_ui_backup_codes')}</p>
            <pre className="mt-2 p-2 bg-gray-100 rounded text-sm font-mono">{backupCodes.join('\n')}</pre>
            <Button variant="secondary" onClick={handleDownload}>
              {localize('com_ui_download_backup')}
            </Button>
            <Button onClick={handleConfirm} disabled={!downloaded}>
              {localize('com_ui_done')}
            </Button>
          </div>
        )}

        {/* Disable 2FA */}
        {user?.totpEnabled && phase === 'disable' && (
          <div className="flex flex-col gap-4">
            <Input
              value={disableToken}
              onChange={(e) => setDisableToken(e.target.value)}
              placeholder={localize('com_ui_2fa_code_placeholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleDisableVerify();
                }
              }}
            />
            <Button
              variant="destructive"
              onClick={handleDisableVerify}
              disabled={!disableToken || isDisabling}
            >
              {isDisabling && <Spinner className="mr-2" />}
              {localize('com_ui_2fa_disable')}
            </Button>
          </div>
        )}
      </OGDialogContent>
    </OGDialog>
  );
};

export default React.memo(TwoFactorAuthentication);