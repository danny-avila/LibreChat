import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

const PaypalReturnHandler = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const paymentId = searchParams.get('paymentId');
    const PayerID = searchParams.get('PayerID');
    const paymentReference = searchParams.get('paymentReference');

    if (paymentId && PayerID && paymentReference) {
      navigate(`/subscription/${paymentId}/payment-success`);
    } else {
      navigate('/subscription/payment-error', { state: { error: 'Missing payment information.' } });
    }
  }, [searchParams, navigate]);

  return <div>Processing your payment...</div>;
};

export default PaypalReturnHandler;
