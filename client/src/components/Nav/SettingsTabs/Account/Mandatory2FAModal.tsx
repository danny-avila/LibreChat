import React, { useCallback, useState } from 'react';
import { useSetRecoilState } from 'recoil';
import { ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  OGDialog,
  useToastContext,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  Progress,
} from '@librechat/client';
import type { TUser } from 'librechat-data-provider';
import type { Variants } from 'framer-motion';
import {
  useConfirmTwoFactorMutation,
  useEnableTwoFactorMutation,
  useVerifyTwoFactorMutation,
} from '~/data-provider';
import { SetupPhase, QRPhase, VerifyPhase, BackupPhase } from './TwoFactorPhases';
import { useLocalize } from '~/hooks';
import store from '~/store';

type SetupOnlyPhase = 'setup' | 'qr' | 'verify' | 'backup';

const phaseVariants: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.3, ease: 'easeIn' } },
};

const phasesLabel: Record<SetupOnlyPhase, string> = {
  setup: 'Setup',
  qr: 'Scan QR',
  verify: 'Verify',
  backup: 'Backup',
};
const steps = Object.values(phasesLabel);

/**
 * Blocking 2FA setup gate rendered in `Root` when the instance sets
 * `registration.mandatoryTwoFactor` and the signed-in user hasn't completed
 * TOTP setup yet. Reuses the same phase components as the optional
 * Settings-page flow (`TwoFactorAuthentication`), but with no trigger, no
 * disable path, and no way to dismiss before finishing setup.
 */
const Mandatory2FAModal: React.FC = () => {
  const localize = useLocalize();
  const setUser = useSetRecoilState(store.user);
  const { showToast } = useToastContext();

  const [phase, setPhase] = useState<SetupOnlyPhase>('setup');
  const [secret, setSecret] = useState<string>('');
  const [otpauthUrl, setOtpauthUrl] = useState<string>('');
  const [downloaded, setDownloaded] = useState<boolean>(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verificationToken, setVerificationToken] = useState<string>('');

  const { mutate: confirm2FAMutate } = useConfirmTwoFactorMutation();
  const { mutate: enable2FAMutate, isLoading: isGenerating } = useEnableTwoFactorMutation();
  const { mutate: verify2FAMutate, isLoading: isVerifying } = useVerifyTwoFactorMutation();

  const currentStep = steps.indexOf(phasesLabel[phase]);

  const handleGenerateQRCode = useCallback(() => {
    enable2FAMutate(undefined, {
      onSuccess: ({ otpauthUrl: url, backupCodes: codes }) => {
        setOtpauthUrl(url);
        setSecret(url.split('secret=')[1].split('&')[0]);
        setBackupCodes(codes);
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
          twoFactorEnabled: true,
        }) as TUser,
    );
  }, [setUser, localize, showToast, backupCodes]);

  return (
    <OGDialog open onOpenChange={() => {}}>
      <OGDialogContent
        className="w-11/12 max-w-lg p-6"
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
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
                <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
                {localize('com_ui_2fa_mandatory_title')}
              </OGDialogTitle>
              <p className="mt-2 text-sm text-text-secondary">
                {localize('com_ui_2fa_mandatory_description')}
              </p>
              <div className="mt-4 space-y-3">
                <Progress
                  value={(currentStep / (steps.length - 1)) * 100}
                  className="h-2 rounded-full"
                />
                <div className="flex justify-between text-sm">
                  {steps.map((step, index) => (
                    <span
                      key={step}
                      className="font-medium"
                      style={{
                        color:
                          currentStep >= index ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      }}
                    >
                      {step}
                    </span>
                  ))}
                </div>
              </div>
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
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>
      </OGDialogContent>
    </OGDialog>
  );
};

export default React.memo(Mandatory2FAModal);
