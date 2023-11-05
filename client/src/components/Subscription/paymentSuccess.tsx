import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';

interface RouteParams {
  [key: string]: string | undefined;
  userId: string;
}

const PaymentSuccess = () => {
  // Retrieve the user ID from the URL.
  const { userId } = useParams<RouteParams>();

  useEffect(() => {
    // Here you could dispatch an action to update the user's subscription status,
    // Or perform any side effects related to the successful payment.
    console.log(`Payment successful for user ID: ${userId}`);
    // Make sure to include any dependencies for the effect here.
    // If there are none other than userId, then it's not necessary to include anything else.
  }, [userId]);

  return (
    <div className="payment-success">
      <h1>Payment Successful!</h1>
      <p>Your payment has been processed successfully.</p>
      {/* Display the user ID in your message */}
      <p>Thank you, user {userId}, for your subscription.</p>
    </div>
  );
};

export default PaymentSuccess;

