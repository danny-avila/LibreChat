import React, { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

const PaymentFailed = () => {
  const { userId } = useParams();
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');

  useEffect(() => {
    console.log(`Payment failed for user ID: ${userId}. Error: ${error}`);
    // Additional failure handling logic here
  }, [userId, error]);

  return (
    <div className="payment-failed">
      <h1>Payment Failed</h1>
      <p>We encountered an issue processing your payment: {error}</p>
      <p>User {userId}, please try again or contact support for assistance.</p>
    </div>
  );
};

export default PaymentFailed;
