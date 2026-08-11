import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useAcknowledgeTwoFactorSetupMutation,
  useConfirmTwoFactorSetupMutation,
  useEnableTwoFactorSetupMutation,
  useFinalizeTwoFactorSetupMutation,
} from '~/data-provider';
import {
  BackupPhase,
  QRPhase,
  SetupPhase,
  VerifyPhase,
} from '~/components/Nav/SettingsTabs/Account/TwoFactorPhases';
import { useAuthContext, useLocalize } from '~/hooks';
import { ErrorMessage } from './ErrorMessage';
import { isSafeRedirect } from '~/utils';

type SetupPhaseName = 'setup' | 'qr' | 'verify' | 'backup';

const getSecret = (otpauthUrl: string): string => {
  const value = otpauthUrl.match(/[?&]secret=([^&]+)/)?.[1];
  return value ? decodeURIComponent(value) : '';
};

const isExpiredSetupCredential = (error: unknown): boolean =>
  (error as { response?: { status?: number } } | undefined)?.response?.status === 401;

const TwoFactorSetupScreen: React.FC = React.memo(() => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const localize = useLocalize();
  const { completeAuthentication } = useAuthContext();
  const phaseRef = useRef<HTMLDivElement>(null);
  const tempToken = searchParams.get('tempToken')?.trim() ?? '';
  const [phase, setPhase] = useState<SetupPhaseName>('setup');
  const [secret, setSecret] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verificationToken, setVerificationToken] = useState('');
  const [acknowledgementToken, setAcknowledgementToken] = useState('');
  const [finalizationToken, setFinalizationToken] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { mutate: enableSetup, isLoading: isGenerating } = useEnableTwoFactorSetupMutation();
  const { mutate: confirmSetup, isLoading: isVerifying } = useConfirmTwoFactorSetupMutation();
  const { mutate: acknowledgeSetup, isLoading: isAcknowledging } =
    useAcknowledgeTwoFactorSetupMutation();
  const { mutate: finalizeSetup, isLoading: isFinalizing } = useFinalizeTwoFactorSetupMutation();
  const redirectTo = searchParams.get('redirect_to');
  const restartLoginPath =
    redirectTo && isSafeRedirect(redirectTo)
      ? `/login?redirect_to=${encodeURIComponent(redirectTo)}`
      : '/login';

  useEffect(() => {
    phaseRef.current?.focus();
  }, [phase]);

  const restartLoginWhenExpired = useCallback(
    (mutationError: unknown): boolean => {
      if (!isExpiredSetupCredential(mutationError)) {
        return false;
      }
      navigate(restartLoginPath, { replace: true });
      return true;
    },
    [navigate, restartLoginPath],
  );

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
        onError: (mutationError) => {
          if (!restartLoginWhenExpired(mutationError)) {
            setError(localize('com_auth_two_factor_setup_expired'));
          }
        },
      },
    );
  }, [enableSetup, localize, restartLoginWhenExpired, tempToken]);

  const handleVerify = useCallback(() => {
    if (verificationToken.length !== 6) {
      return;
    }

    setError(null);
    confirmSetup(
      { tempToken, token: verificationToken },
      {
        onSuccess: (data) => {
          if (!data.acknowledgementToken || !data.backupCodes.length) {
            setError(localize('com_ui_2fa_invalid'));
            return;
          }
          setBackupCodes(data.backupCodes);
          setAcknowledgementToken(data.acknowledgementToken);
          /** Confirming again rotates the codes server-side, retiring any earlier credential. */
          setFinalizationToken('');
          setDownloaded(false);
          setPhase('backup');
        },
        onError: (mutationError) => {
          if (!restartLoginWhenExpired(mutationError)) {
            setError(localize('com_ui_2fa_invalid'));
          }
        },
      },
    );
  }, [confirmSetup, localize, restartLoginWhenExpired, tempToken, verificationToken]);

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

  const runFinalize = useCallback(
    (token: string) => {
      finalizeSetup(
        { finalizationToken: token },
        {
          onSuccess: ({ token: authToken, user }) => completeAuthentication(authToken, user),
          onError: (mutationError) => {
            if (!restartLoginWhenExpired(mutationError)) {
              setError(localize('com_auth_two_factor_setup_finalize_error'));
            }
          },
        },
      );
    },
    [completeAuthentication, finalizeSetup, localize, restartLoginWhenExpired],
  );

  const handleComplete = useCallback(() => {
    setError(null);
    /** Acknowledgement nonces are single-use, so a retry reuses the finalization credential. */
    if (finalizationToken) {
      runFinalize(finalizationToken);
      return;
    }
    if (!acknowledgementToken) {
      return;
    }

    acknowledgeSetup(
      { acknowledgementToken },
      {
        onSuccess: ({ finalizationToken: issuedToken }) => {
          setFinalizationToken(issuedToken);
          runFinalize(issuedToken);
        },
        onError: (mutationError) => {
          if (!restartLoginWhenExpired(mutationError)) {
            setError(localize('com_auth_two_factor_setup_finalize_error'));
          }
        },
      },
    );
  }, [
    acknowledgementToken,
    acknowledgeSetup,
    finalizationToken,
    localize,
    restartLoginWhenExpired,
    runFinalize,
  ]);

  if (!tempToken) {
    return <ErrorMessage>{localize('com_auth_two_factor_setup_expired')}</ErrorMessage>;
  }

  return (
    <div className="mt-4 space-y-6 text-text-primary">
      <p className="text-center text-sm text-text-primary">
        {localize('com_auth_two_factor_setup_required_description')}
      </p>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <div
        ref={phaseRef}
        tabIndex={-1}
        aria-live="polite"
        data-testid="two-factor-setup-phase"
        className="focus:outline-none"
      >
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
            isCompleting={isAcknowledging || isFinalizing}
            onNext={handleComplete}
            onError={() => setError(localize('com_ui_2fa_invalid'))}
          />
        )}
      </div>
    </div>
  );
});

export default TwoFactorSetupScreen;
