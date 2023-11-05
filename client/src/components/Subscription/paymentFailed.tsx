import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';

interface RouteParams {
  [key: string]: string | undefined;
  userId: string;
}

const PaymentFailed = () => {
  // Retrieve the user ID from the URL.
  const { userId } = useParams<RouteParams>();

  useEffect(() => {
    // Here you could dispatch an action to log the failed payment attempt,
    // send a report, or enable the user to try the payment process again.
    console.log(`Payment failed for user ID: ${userId}`);
    // Make sure to handle any cleanup or retries necessary when payment fails.
  }, [userId]);

  return (
    <div className="payment-failed">
      <h1>Payment Failed</h1>
      <p>We encountered an issue processing your payment.</p>
      {/* Display the user ID in your message if needed */}
      <p>User {userId}, please try again or contact support for assistance.</p>
    </div>
  );
};

export default PaymentFailed;