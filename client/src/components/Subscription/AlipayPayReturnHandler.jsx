import React, { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

const AlipayReturnHandler = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const paymentReference = searchParams.get('paymentReference');
    const userId = searchParams.get('userId');
    const sessionId = searchParams.get('sessionId');
    const planId = searchParams.get('planId');

    if (paymentReference) {
      const queryParams = new URLSearchParams({
        paymentReference,
        userId,
        sessionId,
        planId,
        paymentMethod: 'alipay'
      }).toString();

      fetch(`/api/payments/verify-alipay?${queryParams}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      })
        .then(response => response.json())
        .then(data => {
          if (data.status === 'success') {
            navigate(`/subscription/${data.userId}/payment-success?subscriptionStartDate=${data.subscriptionStartDate}&expirationDate=${data.expirationDate}`);
          } else if (data.status === 'pending') {
            // Navigate to a pending payment page or show a pending message
            navigate('/subscription/payment-pending');
          } else {
            navigate('/subscription/payment-failed');
          }
        })
        .catch(error => {
          console.error('[AlipayReturnHandler] Error:', error);
          navigate('/subscription/payment-error');
        });
    } else {
      console.error('[AlipayReturnHandler] Missing payment reference.');
      navigate('/subscription/payment-error');
    }
  }, [searchParams, navigate]);

  return <div>Processing your Alipay payment...</div>;
};

export default AlipayReturnHandler;
