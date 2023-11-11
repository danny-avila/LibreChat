import React, { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import './PaymentMessages.css'; // Import the CSS file

const PaymentSuccess = () => {
  const { userId } = useParams();
  const [searchParams] = useSearchParams();
  const paymentId = searchParams.get('paymentId');
  const startTime = searchParams.get('startTime');
  const endTime = searchParams.get('endTime');

  useEffect(() => {
    console.log(`Payment successful for user ID: ${userId} with Payment ID: ${paymentId}`);
    console.log(`Start Time: ${startTime}, End Time: ${endTime}`);
  }, [userId, paymentId, startTime, endTime]);

  return (
    <div className="payment-message-container">
      <div className="payment-message payment-success">
        <h1>🎉 Success! Your Payment is Confirmed!</h1>
        <p>Heartfelt thanks for subscribing! We&apos;ve successfully processed your payment.</p>
        <p>Delight in your AITok access, available from {startTime} until {endTime}.</p>
        <p>For uninterrupted enjoyment, kindly renew your subscription by {endTime}.</p>
      </div>
    </div>
  );
};

export default PaymentSuccess;
