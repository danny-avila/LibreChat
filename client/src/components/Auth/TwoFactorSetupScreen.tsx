import React, { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BackupPhase,
  QRPhase,
  SetupPhase,
  VerifyPhase,
} from '~/components/Nav/SettingsTabs/Account/TwoFactorPhases';
import { useConfirmTwoFactorSetupMutation, useEnableTwoFactorSetupMutation } from '~/data-provider';
import { ErrorMessage } from './ErrorMessage';
import { useLocalize } from '~/hooks';

type SetupPhaseName = 'setup' | 'qr' | 'verify' | 'backup';

const getSecret = (otpauthUrl: string): string => {
  const value = otpauthUrl.match(/[?&]secret=([^&]+)/)?.[1];
  return value ? decodeURIComponent(value) : '';
};

const TwoFactorSetupScreen: React.FC = React.memo(() => {
  const [searchParams] = useSearchParams();
  const localize = useLocalize();
  const tempToken = searchParams.get('tempToken')?.trim() ?? '';
  const [phase, setPhase] = useState<SetupPhaseName>('setup');
  const [secret, setSecret] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verificationToken, setVerificationToken] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { mutate: enableSetup, isLoading: isGenerating } = useEnableTwoFactorSetupMutation();
  const { mutate: confirmSetup, isLoading: isVerifying } = useConfirmTwoFactorSetupMutation();

  const handleGenerate = useCallback(() => {
    setError(null);
    enableSetup(
      { tempToken },
      {
        onSuccess: (data) => {
          setOtpauthUrl(data.otpauthUrl);
          setSecret(getSecret(data.otpauthUrl));
          setBackupCodes(data.backupCodes);
          setPhase('qr');
        },
        onError: () => setError(localize('com_auth_two_factor_setup_expired')),
      },
    );
  }, [enableSetup, localize, tempToken]);

  const handleVerify = useCallback(() => {
    if (verificationToken.length !== 6) {
      return;
    }

    setError(null);
    confirmSetup(
      { tempToken, token: verificationToken },
      {
        onSuccess: (data) => {
          if (!data.token) {
            setError(localize('com_ui_2fa_invalid'));
            return;
          }
          setPhase('backup');
        },
        onError: () => setError(localize('com_ui_2fa_invalid')),
      },
    );
  }, [confirmSetup, localize, tempToken, verificationToken]);

  const handleDownload = useCallback(() => {
    if (!backupCodes.length) {
      return;
    }

    const blob = new Blob([backupCodes.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'backup-codes.txt';
    anchor.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  }, [backupCodes]);

  const handleComplete = useCallback(() => {
    window.location.href = '/';
  }, []);

  if (!tempToken) {
    return <ErrorMessage>{localize('com_auth_two_factor_setup_expired')}</ErrorMessage>;
  }

  return (
    <div className="mt-4 space-y-6 text-text-primary">
      <p className="text-center text-sm text-text-primary">
        {localize('com_auth_two_factor_setup_required_description')}
      </p>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {phase === 'setup' && (
        <SetupPhase
          isGenerating={isGenerating}
          onGenerate={handleGenerate}
          onNext={() => setPhase('qr')}
          onError={() => setError(localize('com_auth_two_factor_setup_expired'))}
        />
      )}
      {phase === 'qr' && (
        <QRPhase
          secret={secret}
          otpauthUrl={otpauthUrl}
          onNext={() => setPhase('verify')}
          onError={() => setError(localize('com_auth_two_factor_setup_expired'))}
        />
      )}
      {phase === 'verify' && (
        <VerifyPhase
          token={verificationToken}
          onTokenChange={setVerificationToken}
          isVerifying={isVerifying}
          onNext={handleVerify}
          onError={() => setError(localize('com_ui_2fa_invalid'))}
        />
      )}
      {phase === 'backup' && (
        <BackupPhase
          backupCodes={backupCodes}
          onDownload={handleDownload}
          downloaded={downloaded}
          onNext={handleComplete}
          onError={() => setError(localize('com_ui_2fa_invalid'))}
        />
      )}
    </div>
  );
});

export default TwoFactorSetupScreen;
