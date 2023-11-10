import React, { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import './PaymentMessages.css'; // Import the CSS file

const PaymentSuccess = () => {
  const { userId } = useParams();
  const [searchParams] = useSearchParams();
  const paymentId = searchParams.get('paymentId');

  useEffect(() => {
    console.log(`Payment successful for user ID: ${userId} with Payment ID: ${paymentId}`);
  }, [userId, paymentId]);

  return (
    <div className="payment-message-container">
      <div className="payment-message payment-success">
        <h1>🎉 Payment Successful!</h1>
        <p>Your payment has been processed successfully.</p>
        <p>Thank you, user {userId}, for your subscription. Your payment ID is {paymentId}.</p>
      </div>
    </div>
  );
};

export default PaymentSuccess;
