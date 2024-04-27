import { useState, useEffect } from 'react';
import { useVerifyEmailMutation } from 'librechat-data-provider/react-query';
import type { TVerifyEmail } from 'librechat-data-provider';
import { ThemeSelector } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { Spinner } from '~/components/svg';
import { useSearchParams, useNavigate } from 'react-router-dom';

function RequestPasswordReset() {
  const localize = useLocalize();
  const verifyEmail = useVerifyEmailMutation();
  const [params] = useSearchParams();
  const [verificationStatus, setVerificationStatus] = useState<boolean>(false);
  const [verificationInProgress, setVerificationInProgress] = useState<boolean>(false);
  const [headerText, setHeaderText] = useState<string>('');
  const [countdown, setCountdown] = useState<number>(5);
  const navigate = useNavigate();
  const data: TVerifyEmail = {
    token: params.get('token') || '',
    userId: params.get('userId') || '',
  };

  const onSubmit = (data: TVerifyEmail) => {
    verifyEmail.mutate(data, {
      onSuccess: () => {
        setHeaderText(localize('com_auth_email_verification_success') + ' 🎉');
        setVerificationStatus(true);
        const timer = setInterval(() => {
          setCountdown((prevCountdown) => prevCountdown - 1);
        }, 1000);
        setTimeout(() => {
          clearInterval(timer);
          navigate('/c/new', { replace: true });
        }, 5000);
      },
      onError: () => {
        setVerificationStatus(true);
        setHeaderText(localize('com_auth_email_verification_failed') + ' 😢');
      },
    });
  };

  useEffect(() => {
    if (verificationInProgress === true) {
      return;
    }

    if (data.token && data.userId) {
      onSubmit(data);
      setVerificationInProgress(true);
    } else {
      setHeaderText(localize('com_auth_email_verification_invalid') + ' 🤨');
      setVerificationStatus(true);
    }
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white pt-6 dark:bg-gray-900 sm:pt-0">
      <div className="absolute bottom-0 left-0 m-4">
        <ThemeSelector />
      </div>
      {verificationStatus ? (
        <div className="flex flex-col items-center justify-center">
          <h1 className="mb-4 text-center text-3xl font-semibold text-black dark:text-white">
            {headerText}
          </h1>
          {countdown > 0 && (
            <p className="text-center text-lg text-gray-600 dark:text-gray-400">
              {localize('com_auth_email_verification_redirecting', countdown.toString())}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center">
          <h1 className="mb-4 text-center text-3xl font-semibold text-black dark:text-white">
            {localize('com_auth_email_verification_in_progress')}
          </h1>
          <div className="mt-4 flex justify-center">
            <Spinner className="h-8 w-8 text-green-500" />
          </div>
        </div>
      )}
    </div>
  );
}

export default RequestPasswordReset;
