import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

const PaypalReturnHandler = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const paymentId = searchParams.get('paymentId');
    const PayerID = searchParams.get('PayerID');
    const paymentReference = searchParams.get('paymentReference');

    console.log(`[PaypalReturnHandler] Payment ID: ${paymentId}, Payer ID: ${PayerID}, Payment Reference: ${paymentReference}`);

    if (paymentId && PayerID && paymentReference) {
      const queryParams = new URLSearchParams({
        PayerID,
        paymentId,
        paymentReference,
        paymentMethod: 'paypal'
      }).toString();

      fetch(`/api/payments/success?${queryParams}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      })
        .then(response => response.json())
        .then(data => {
          if (data.status === 'success') {
            navigate(`/subscription/${data.userId}/payment-success?paymentId=${data.paymentId}&startTime=${data.startTime}&endTime=${data.endTime}`);
          } else {
            navigate(`/subscription/${data.userId}/payment-failed?error=${data.error}`);
          }
        })
        .catch(error => {
          console.error('[PaypalReturnHandler] Error processing payment:', error);
          navigate('/subscription/payment-error', { state: { error: error.message } });
        });
    } else {
      console.error('[PaypalReturnHandler] Missing payment information.');
      navigate('/subscription/payment-error', { state: { error: 'Missing payment information.' } });
    }
  }, [searchParams, navigate]);

  return <div>Processing your payment...</div>;
};

export default PaypalReturnHandler;
