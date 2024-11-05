import { useSearchParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useVerifyPaymentMutation } from 'librechat-data-provider/react-query';
import { ThemeSelector } from '~/components/ui';
import { Spinner } from '~/components/svg';
import { useLocalize } from '~/hooks';

function VerifyPayment() {
  const navigate = useNavigate();
  const localize = useLocalize();
  const [params] = useSearchParams();

  const [countdown, setCountdown] = useState<number>(3);
  const [headerText, setHeaderText] = useState<string>('');
  const [showRetryLink, setShowRetryLink] = useState<boolean>(false);
  const [verificationStatus, setVerificationStatus] = useState<boolean>(false);

  const transactionId = useMemo(() => params.get('Authority') || '', [params]);
  const status = useMemo(() => params.get('Status'), [params]);  // Consider status as a string here

  const countdownRedirect = useCallback(() => {
    setCountdown(3);
    const timer = setInterval(() => {
      setCountdown((prevCountdown) => {
        if (prevCountdown <= 1) {
          clearInterval(timer);
          navigate('/', { replace: true }); // Redirect to payment history or relevant page
          return 0;
        } else {
          return prevCountdown - 1;
        }
      });
    }, 1000);
  }, [navigate]);

  const verifyPaymentMutation = useVerifyPaymentMutation();

  const handleRetryVerification = () => {
    if (transactionId) {
      verifyPaymentMutation.mutate(
        { authority: transactionId, amount: 100 },
        {
          onSuccess: (response) => {
            if (response.success) {
              setHeaderText(localize('com_payment_verification_success') + ' 🎉');
              setVerificationStatus(true);
              countdownRedirect();
            } else {
              setHeaderText(localize('com_payment_verification_failed') + ' 😢');
              setShowRetryLink(true);
              setVerificationStatus(true);
              setCountdown(5);
              countdownRedirect();
            }
          },
          onError: () => {
            setShowRetryLink(true);
            setVerificationStatus(true);
            setHeaderText(localize('com_payment_verification_failed') + ' 😢');
            setCountdown(5);
            countdownRedirect();
          },
        },
      );
    }
  };

  useEffect(() => {
    if (verifyPaymentMutation.isLoading || verificationStatus) {
      return;
    }

    if (transactionId) {
      handleRetryVerification();
    } else {
      setHeaderText(localize('com_payment_verification_invalid') + ' 🤨');
      setShowRetryLink(true);
      setVerificationStatus(true);
      setCountdown(0);
    }
  }, [localize, transactionId, verificationStatus, verifyPaymentMutation]);

  const VerificationSuccess = () => (
    <div className="flex flex-col items-center justify-center">
      <h1 className="mb-4 text-center text-3xl font-semibold text-black dark:text-white">
        {headerText}
      </h1>
      {countdown > 0 && (
        <p className="text-center text-lg text-gray-600 dark:text-gray-400">
          {localize('com_payment_verification_redirecting', countdown.toString())}
        </p>
      )}
      {showRetryLink && countdown === 0 && (
        <p className="text-center text-lg text-gray-600 dark:text-gray-400">
          {localize('com_payment_verification_retry_prompt')}
          <button
            className="ml-2 text-blue-600 hover:underline"
            onClick={handleRetryVerification}
            disabled={verifyPaymentMutation.isLoading}
          >
            {localize('com_payment_retry_link')}
          </button>
        </p>
      )}
    </div>
  );

  const VerificationInProgress = () => (
    <div className="flex flex-col items-center justify-center">
      <h1 className="mb-4 text-center text-3xl font-semibold text-black dark:text-white">
        {localize('com_payment_verification_in_progress')}
      </h1>
      <div className="mt-4 flex justify-center">
        <Spinner className="h-8 w-8 text-green-500" />
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white pt-6 dark:bg-gray-900 sm:pt-0">
      <div className="absolute bottom-0 left-0 m-4">
        <ThemeSelector />
      </div>
      {verificationStatus ? <VerificationSuccess /> : <VerificationInProgress />}
    </div>
  );
}

export default VerifyPayment;
