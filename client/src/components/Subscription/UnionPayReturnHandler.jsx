import React, { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

const UnionPayReturnHandler = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    console.log('[UnionPayReturnHandler] useEffect triggered');

    const paymentReference = searchParams.get('paymentReference');
    const userId = searchParams.get('userId');
    const sessionId = searchParams.get('sessionId');
    const planId = searchParams.get('planId');

    console.log(`[UnionPayReturnHandler] Retrieved search params: paymentReference=${paymentReference}, userId=${userId}, sessionId=${sessionId}, planId=${planId}`);

    if (paymentReference && sessionId && userId && planId) {
      const queryParams = new URLSearchParams({
        paymentReference,
        userId,
        sessionId,
        planId,
        paymentMethod: 'unionpay'
      }).toString();

      console.log(`[UnionPayReturnHandler] Fetching /api/payments/verify-unionpay with queryParams: ${queryParams}`);

      fetch(`/api/payments/verify-unionpay?${queryParams}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      })
        .then(response => {
          console.log(`[UnionPayReturnHandler] Received response from server: status ${response.status}`);
          return response.json();
        })
        .then(data => {
          console.log('[UnionPayReturnHandler] Response data:', data);
          if (data.status === 'success') {
            navigate(`/subscription/${userId}/payment-success?subscriptionStartDate=${data.subscriptionStartDate}&expirationDate=${data.expirationDate}`);
          } else if (data.status === 'pending') {
            navigate('/subscription/payment-pending');
          } else {
            navigate('/subscription/payment-failed');
          }
        })
        .catch(error => {
          console.error('[UnionPayReturnHandler] Error fetching data:', error);
          navigate('/subscription/payment-error');
        });
    } else {
      console.error('[UnionPayReturnHandler] Missing required parameters.');
      navigate('/subscription/payment-error');
    }
  }, [searchParams, navigate]);

  return <div>Processing your UnionPay payment...</div>;
};

export default UnionPayReturnHandler;