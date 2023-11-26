import React, { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

const WeChatPayReturnHandler = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const paymentReference = searchParams.get('paymentReference');
    const userId = searchParams.get('userId');
    const sessionId=searchParams.get('sessionId');
    const planId = searchParams.get('planId');

    if (paymentReference) {
      const queryParams = new URLSearchParams({
        paymentReference,
        userId,
        sessionId,
        planId,
        paymentMethod: 'wechatpay'
      }).toString();

      fetch(`/api/payments/verify-wechatpay?${queryParams}`, {
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
          console.error('[WeChatPayReturnHandler] Error:', error);
          navigate('/subscription/payment-error');
        });
    } else {
      console.error('[WeChatPayReturnHandler] Missing session ID.');
      navigate('/subscription/payment-error');
    }
  }, [searchParams, navigate]);

  return <div>Processing your WeChat Pay payment...</div>;
};

export default WeChatPayReturnHandler;
