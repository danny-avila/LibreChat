import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useVerifyEmailMutation } from '~/data-provider';
import { ThemeSelector } from '~/components/ui';
import { Spinner } from '~/components/svg';
import { useLocalize } from '~/hooks';

function RequestPasswordReset() {
  const navigate = useNavigate();
  const localize = useLocalize();
  const [params] = useSearchParams();

  const [countdown, setCountdown] = useState<number>(5);
  const [headerText, setHeaderText] = useState<string>('');
  const [verificationStatus, setVerificationStatus] = useState<boolean>(false);

  const token = useMemo(() => params.get('token') || '', [params]);
  const email = useMemo(() => params.get('email') || '', [params]);

  const verifyEmailMutation = useVerifyEmailMutation({
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
      setCountdown(0);
    },
  });

  useEffect(() => {
    if (verifyEmailMutation.isLoading || verificationStatus) {
      return;
    }

    if (token && email) {
      verifyEmailMutation.mutate({
        email,
        token,
      });
    } else {
      setHeaderText(localize('com_auth_email_verification_invalid') + ' 🤨');
      setVerificationStatus(true);
      setCountdown(0);
    }
  }, [localize, token, email, verificationStatus, verifyEmailMutation]);

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
