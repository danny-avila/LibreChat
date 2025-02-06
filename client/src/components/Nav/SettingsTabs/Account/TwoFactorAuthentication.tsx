import React, { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useSetRecoilState } from 'recoil';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { Copy, Check, Shield, QrCode, Download } from 'lucide-react';
import {
  useEnableTwoFactorMutation,
  useVerifyTwoFactorMutation,
  useConfirmTwoFactorMutation,
  useDisableTwoFactorMutation,
} from 'librechat-data-provider/react-query';
import type { TUser } from 'librechat-data-provider';
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
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
  Progress,
} from '~/components';
import { useAuthContext, useLocalize } from '~/hooks';
import HoverCardSettings from '../HoverCardSettings';
import { useToastContext } from '~/Providers';
import { cn } from '~/utils';
import store from '~/store';

type Phase = 'setup' | 'qr' | 'verify' | 'backup' | 'disable';

const TwoFactorAuthentication: React.FC = () => {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const setUser = useSetRecoilState(store.user);
  const { showToast } = useToastContext();

  const [isDialogOpen, setDialogOpen] = useState<boolean>(false);
  const [phase, setPhase] = useState<Phase>(user?.totpEnabled ?? false ? 'disable' : 'setup');
  const [otpauthUrl, setOtpauthUrl] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verificationToken, setVerificationToken] = useState<string>('');
  const [disableToken, setDisableToken] = useState<string>('');
  const [downloaded, setDownloaded] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);

  const { mutate: enable2FAMutate } = useEnableTwoFactorMutation();
  const { mutate: verify2FAMutate, isLoading: isVerifying } = useVerifyTwoFactorMutation();
  const { mutate: confirm2FAMutate } = useConfirmTwoFactorMutation();
  const { mutate: disable2FAMutate, isLoading: isDisabling } = useDisableTwoFactorMutation();

  const steps = ['Setup', 'Scan QR', 'Verify', 'Backup'];
  const phases: Record<Phase, string> = {
    setup: 'Setup',
    qr: 'Scan QR',
    verify: 'Verify',
    backup: 'Backup',
    disable: '',
  };

  const currentStep = steps.indexOf(phases[phase]);

  useEffect(() => {
    setProgress((currentStep / (steps.length - 1)) * 100);
  }, [currentStep]);

  const resetState = useCallback(() => {
    if (user?.totpEnabled !== true && otpauthUrl) {
      disable2FAMutate(undefined, {
        onError: () =>
          showToast({ message: localize('com_ui_2fa_disable_error'), status: 'error' }),
      });
    }

    setOtpauthUrl('');
    setSecret('');
    setBackupCodes([]);
    setVerificationToken('');
    setDisableToken('');
    setPhase(user?.totpEnabled ?? false ? 'disable' : 'setup');
    setDownloaded(false);
    setCopied(false);
    setProgress(0);
  }, [user, otpauthUrl, disable2FAMutate, localize, showToast]);

  const handleGenerateQRCode = useCallback(() => {
    enable2FAMutate(undefined, {
      onSuccess: ({ otpauthUrl, backupCodes }) => {
        setOtpauthUrl(otpauthUrl);
        setSecret(otpauthUrl.split('secret=')[1].split('&')[0]);
        setBackupCodes(backupCodes);
        setPhase('qr');
      },
      onError: () => showToast({ message: localize('com_ui_2fa_generate_error'), status: 'error' }),
    });
  }, [enable2FAMutate, localize, showToast]);

  const handleCopySecret = useCallback(() => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [secret]);

  const handleVerify = useCallback(() => {
    if (!verificationToken) {
      return;
    }

    verify2FAMutate(
      { token: verificationToken },
      {
        onSuccess: () => {
          showToast({ message: localize('com_ui_2fa_verified') });
          confirm2FAMutate(
            { token: verificationToken },
            {
              onSuccess: () => setPhase('backup'),
              onError: () =>
                showToast({ message: localize('com_ui_2fa_invalid'), status: 'error' }),
            },
          );
        },
        onError: () => showToast({ message: localize('com_ui_2fa_invalid'), status: 'error' }),
      },
    );
  }, [verificationToken, verify2FAMutate, confirm2FAMutate, localize, showToast]);

  const handleDownload = useCallback(() => {
    if (!backupCodes.length) {
      return;
    }

    const blob = new Blob([backupCodes.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  }, [backupCodes]);

  const handleConfirm = useCallback(() => {
    setDialogOpen(false);
    showToast({ message: localize('com_ui_2fa_enabled') });
    setUser((prev) => ({ ...prev, totpEnabled: true } as TUser));
  }, [setUser, localize, showToast]);

  const handleDisableVerify = useCallback(() => {
    if (!disableToken) {
      return;
    }

    verify2FAMutate(
      { token: disableToken },
      {
        onSuccess: () => {
          disable2FAMutate(undefined, {
            onSuccess: () => {
              showToast({ message: localize('com_ui_2fa_disabled') });
              setDialogOpen(false);
              setUser(
                (prev) =>
                  ({
                    ...prev,
                    totpEnabled: false,
                    totpSecret: '',
                    backupCodes: [],
                  } as TUser),
              );
              setPhase('setup');
              setOtpauthUrl('');
            },
            onError: () =>
              showToast({ message: localize('com_ui_2fa_disable_error'), status: 'error' }),
          });
        },
        onError: () => showToast({ message: localize('com_ui_2fa_invalid'), status: 'error' }),
      },
    );
  }, [disableToken, verify2FAMutate, disable2FAMutate, setUser, localize, showToast]);

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
          <Label className="font-light">{localize('com_nav_2fa')}</Label>
          <HoverCardSettings side="bottom" text="com_nav_info_2fa" />
        </div>
        <OGDialogTrigger asChild>
          <Button
            variant={user?.totpEnabled ?? false ? 'destructive' : 'outline'}
            className="flex items-center gap-2"
            disabled={isVerifying || isDisabling}
          >
            <Shield className="h-4 w-4" />
            {user?.totpEnabled ?? false
              ? localize('com_ui_2fa_disable')
              : localize('com_ui_2fa_enable')}
          </Button>
        </OGDialogTrigger>
      </div>

      <OGDialogContent className="w-11/12 max-w-md">
        <OGDialogHeader>
          <OGDialogTitle className="mb-4 text-xl font-semibold">
            {localize(user?.totpEnabled ?? false ? 'com_ui_2fa_disable_setup' : 'com_ui_2fa_setup')}
          </OGDialogTitle>
          {user?.totpEnabled !== true && phase !== 'disable' && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <div className="flex justify-between text-sm text-text-tertiary">
                {steps.map((step, index) => (
                  <span
                    key={step}
                    className={currentStep >= index ? 'font-medium text-text-primary' : ''}
                  >
                    {step}
                  </span>
                ))}
              </div>
            </div>
          )}
        </OGDialogHeader>

        <div className="mt-4">
          {/* Initial Setup */}
          {user?.totpEnabled !== true && phase === 'setup' && (
            <div className="space-y-4">
              <Button
                onClick={handleGenerateQRCode}
                className="flex w-full items-center justify-center gap-2"
              >
                <QrCode className="h-4 w-4" />
                {localize('com_ui_2fa_generate')}
              </Button>
            </div>
          )}

          {/* QR Code Scan */}
          {user?.totpEnabled !== true && phase === 'qr' && (
            <div className="space-y-4">
              <div className="flex flex-col items-center space-y-4">
                <QRCodeSVG
                  value={otpauthUrl}
                  size={200}
                  marginSize={2}
                  className="rounded-2xl p-2"
                />
                <div className="w-full space-y-2">
                  <Label>{localize('com_ui_secret_key')}</Label>
                  <div className="flex gap-2">
                    <Input value={secret} readOnly className="font-mono" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleCopySecret}
                      aria-label="Copy Secret Key"
                      className={cn('shrink-0', copied ? 'cursor-default' : '')}
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
              <Button onClick={() => setPhase('verify')} className="w-full">
                {localize('com_ui_continue')}
              </Button>
            </div>
          )}

          {/* Verification */}
          {user?.totpEnabled !== true && phase === 'verify' && (
            <div className="space-y-8">
              <div className="flex justify-center">
                <Label className="text-center font-normal">
                  {localize('com_ui_enter_verification_code')}
                </Label>
              </div>
              <div className="flex justify-center">
                <InputOTP
                  pattern={REGEXP_ONLY_DIGITS}
                  value={verificationToken}
                  onChange={(value) => setVerificationToken(value)}
                  maxLength={6}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <Button
                onClick={handleVerify}
                disabled={isVerifying || !verificationToken}
                className="w-full"
              >
                {isVerifying && <Spinner className="mr-2" />}
                {localize('com_ui_verify')}
              </Button>
            </div>
          )}

          {/* Backup Codes */}
          {user?.totpEnabled !== true && phase === 'backup' && (
            <div className="space-y-8">
              <Label className="font-light">{localize('com_ui_save_backup_codes')}</Label>
              <div className="grid grid-cols-2 gap-4 rounded-xl bg-surface-secondary p-4 font-mono text-sm">
                {backupCodes.map((code, index) => (
                  <div
                    key={code}
                    className="flex items-center space-x-2 rounded-lg border border-surface-tertiary bg-surface-tertiary p-2"
                  >
                    <span className="select-none text-xs text-text-secondary ">#{index + 1}</span>
                    <span className="font-medium tracking-wider">{code}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleDownload} className="flex-1 gap-2">
                  <Download className="h-4 w-4" />
                  {localize('com_ui_download_backup')}
                </Button>
                <Button onClick={handleConfirm} disabled={!downloaded} className="flex-1">
                  {localize('com_ui_done')}
                </Button>
              </div>
            </div>
          )}

          {/* Disable 2FA */}
          {user?.totpEnabled === true && phase === 'disable' && (
            <div className="space-y-10">
              <div className="flex justify-center">
                <InputOTP
                  pattern={REGEXP_ONLY_DIGITS}
                  value={disableToken}
                  onChange={(value) => setDisableToken(value)}
                  maxLength={6}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <Button
                variant="destructive"
                onClick={handleDisableVerify}
                disabled={disableToken.length < 6 || isDisabling}
                className="flex w-full items-center justify-center gap-2"
              >
                {isDisabling && <Spinner className="mr-2" />}
                <Shield className="h-4 w-4" />
                {localize('com_ui_2fa_disable')}
              </Button>
            </div>
          )}
        </div>
      </OGDialogContent>
    </OGDialog>
  );
};

export default React.memo(TwoFactorAuthentication);
