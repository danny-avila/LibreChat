import React, { useCallback, useState } from 'react';
import { useSetRecoilState } from 'recoil';
import { SmartphoneIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { TUser, TVerify2FARequest } from 'librechat-data-provider';
import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle, Progress } from '~/components';
import { SetupPhase, QRPhase, VerifyPhase, BackupPhase, DisablePhase } from './TwoFactorPhases';
import { DisableTwoFactorToggle } from './DisableTwoFactorToggle';
import { useAuthContext, useLocalize } from '~/hooks';
import { useToastContext } from '~/Providers';
import store from '~/store';
import {
  useConfirmTwoFactorMutation,
  useDisableTwoFactorMutation,
  useEnableTwoFactorMutation,
  useVerifyTwoFactorMutation,
} from '~/data-provider';

export type Phase = 'setup' | 'qr' | 'verify' | 'backup' | 'disable';

const phaseVariants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.3, ease: 'easeIn' } },
};

const TwoFactorAuthentication: React.FC = () => {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const setUser = useSetRecoilState(store.user);
  const { showToast } = useToastContext();

  const [secret, setSecret] = useState<string>('');
  const [otpauthUrl, setOtpauthUrl] = useState<string>('');
  const [downloaded, setDownloaded] = useState<boolean>(false);
  const [disableToken, setDisableToken] = useState<string>('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [isDialogOpen, setDialogOpen] = useState<boolean>(false);
  const [verificationToken, setVerificationToken] = useState<string>('');
  const [phase, setPhase] = useState<Phase>(Array.isArray(user?.backupCodes) && user?.backupCodes.length > 0 ? 'disable' : 'setup');

  const { mutate: confirm2FAMutate } = useConfirmTwoFactorMutation();
  const { mutate: enable2FAMutate, isLoading: isGenerating } = useEnableTwoFactorMutation();
  const { mutate: verify2FAMutate, isLoading: isVerifying } = useVerifyTwoFactorMutation();
  const { mutate: disable2FAMutate, isLoading: isDisabling } = useDisableTwoFactorMutation();

  const steps = ['Setup', 'Scan QR', 'Verify', 'Backup'];
  const phasesLabel: Record<Phase, string> = {
    setup: 'Setup',
    qr: 'Scan QR',
    verify: 'Verify',
    backup: 'Backup',
    disable: '',
  };

  const currentStep = steps.indexOf(phasesLabel[phase]);

  const resetState = useCallback(() => {
    if (Array.isArray(user?.backupCodes) && user?.backupCodes.length > 0 && otpauthUrl) {
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
    setPhase(Array.isArray(user?.backupCodes) && user?.backupCodes.length > 0 ? 'disable' : 'setup');
    setDownloaded(false);
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
    setPhase('disable');
    showToast({ message: localize('com_ui_2fa_enabled') });
    setUser(
      (prev) =>
        ({
          ...prev,
          backupCodes: backupCodes.map((code) => ({
            code,
            codeHash: code,
            used: false,
            usedAt: null,
          })),
        }) as TUser,
    );
  }, [setUser, localize, showToast, backupCodes]);

  const handleDisableVerify = useCallback(
    (token: string, useBackup: boolean) => {
      // Validate: if not using backup, ensure token has at least 6 digits;
      // if using backup, ensure backup code has at least 8 characters.
      if (!useBackup && token.trim().length < 6) {
        return;
      }

      if (useBackup && token.trim().length < 8) {
        return;
      }

      const payload: TVerify2FARequest = {};
      if (useBackup) {
        payload.backupCode = token.trim();
      } else {
        payload.token = token.trim();
      }

      verify2FAMutate(payload, {
        onSuccess: () => {
          disable2FAMutate(undefined, {
            onSuccess: () => {
              showToast({ message: localize('com_ui_2fa_disabled') });
              setDialogOpen(false);
              setUser(
                (prev) =>
                  ({
                    ...prev,
                    totpSecret: '',
                    backupCodes: [],
                  }) as TUser,
              );
              setPhase('setup');
              setOtpauthUrl('');
            },
            onError: () =>
              showToast({ message: localize('com_ui_2fa_disable_error'), status: 'error' }),
          });
        },
        onError: () => showToast({ message: localize('com_ui_2fa_invalid'), status: 'error' }),
      });
    },
    [disableToken, verify2FAMutate, disable2FAMutate, showToast, localize, setUser],
  );

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
      <DisableTwoFactorToggle
        enabled={Array.isArray(user?.backupCodes) && user?.backupCodes.length > 0}
        onChange={() => setDialogOpen(true)}
        disabled={isVerifying || isDisabling || isGenerating}
      />

      <OGDialogContent className="w-11/12 max-w-lg p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={phase}
            variants={phaseVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="space-y-6"
          >
            <OGDialogHeader>
              <OGDialogTitle className="mb-2 flex items-center gap-3 text-2xl font-bold">
                <SmartphoneIcon className="h-6 w-6 text-primary" />
                {Array.isArray(user?.backupCodes) && user?.backupCodes.length > 0 ? localize('com_ui_2fa_disable') : localize('com_ui_2fa_setup')}
              </OGDialogTitle>
              {Array.isArray(user?.backupCodes) && user?.backupCodes.length > 0 && phase !== 'disable' && (
                <div className="mt-4 space-y-3">
                  <Progress
                    value={(steps.indexOf(phasesLabel[phase]) / (steps.length - 1)) * 100}
                    className="h-2 rounded-full"
                  />
                  <div className="flex justify-between text-sm">
                    {steps.map((step, index) => (
                      <motion.span
                        key={step}
                        animate={{
                          color:
                            currentStep >= index ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        }}
                        className="font-medium"
                      >
                        {step}
                      </motion.span>
                    ))}
                  </div>
                </div>
              )}
            </OGDialogHeader>

            <AnimatePresence mode="wait">
              {phase === 'setup' && (
                <SetupPhase
                  isGenerating={isGenerating}
                  onGenerate={handleGenerateQRCode}
                  onNext={() => setPhase('qr')}
                  onError={(error) => showToast({ message: error.message, status: 'error' })}
                />
              )}

              {phase === 'qr' && (
                <QRPhase
                  secret={secret}
                  otpauthUrl={otpauthUrl}
                  onNext={() => setPhase('verify')}
                  onError={(error) => showToast({ message: error.message, status: 'error' })}
                />
              )}

              {phase === 'verify' && (
                <VerifyPhase
                  token={verificationToken}
                  onTokenChange={setVerificationToken}
                  isVerifying={isVerifying}
                  onNext={handleVerify}
                  onError={(error) => showToast({ message: error.message, status: 'error' })}
                />
              )}

              {phase === 'backup' && (
                <BackupPhase
                  backupCodes={backupCodes}
                  onDownload={handleDownload}
                  downloaded={downloaded}
                  onNext={handleConfirm}
                  onError={(error) => showToast({ message: error.message, status: 'error' })}
                />
              )}

              {phase === 'disable' && (
                <DisablePhase
                  onDisable={handleDisableVerify}
                  isDisabling={isDisabling}
                  onError={(error) => showToast({ message: error.message, status: 'error' })}
                />
              )}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>
      </OGDialogContent>
    </OGDialog>
  );
};

export default React.memo(TwoFactorAuthentication);
