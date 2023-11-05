import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { TUser, useGetUserByIdQuery } from '@librechat/data-provider';
import { useRecoilValue } from 'recoil';
import store from '~/store';
import { localize } from '~/localization/Translation';

function SubscriptionContent() {
  const [subscriptionUser, setSubscriptionUser] = useState<TUser | null>(null);
  const [error, setError] = useState(''); // State to hold any error messages
  const { userId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const lang = useRecoilValue(store.lang);
  const navigate = useNavigate();

  const getUserByIdQuery = useGetUserByIdQuery(userId);

  // Effect for fetching user data
  useEffect(() => {
    if (getUserByIdQuery.isSuccess) {
      setSubscriptionUser(getUserByIdQuery.data);
    }
  }, [getUserByIdQuery.isSuccess, getUserByIdQuery.data]);

  // Effect for handling payment status confirmation
  useEffect(() => {
    const paymentStatus = searchParams.get('paymentStatus');
    const paymentId = searchParams.get('paymentId'); // or whatever the parameter is
    const payerId = searchParams.get('PayerID'); // PayPal often returns a PayerID
    if (paymentStatus) {
      handlePaymentConfirmation(paymentStatus, userId, paymentId, payerId);
    }
  }, [searchParams, userId]);

  async function handleSubscription() {
    console.log('handleSubscription function called');
    setError(''); // Clear any existing errors
    try {
      const response = await fetch('/api/payments/create-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        // If the HTTP status code is not successful, throw an error
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data && data.approval_url) {
        // Debugging line: console log the approval URL
        console.log('Approval URL received:', data.approval_url);
        window.location.href = data.approval_url;
      } else {
        // Handle case where no approval URL is present
        console.error('Failed to get approval URL');
        setError('Failed to initiate payment. Please try again.');
      }
    } catch (error) {
      console.error(`An error occurred: ${error}`);
      setError(`An error occurred: ${error.message}`);
    }
  }

  async function handlePaymentConfirmation(userId, paymentId, payerId) {
    // Perform server-side validation to confirm the payment status
    // This is a critical step to ensure security and correctness
    try {
      // Construct the body with necessary information for the server to validate
      const body = JSON.stringify({
        paymentId,
        payerId, // PayPal sends a PayerID on successful payment
      });

      // Call your server-side API to validate the payment
      const response = await fetch('/api/payments/execute-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      });

      if (!response.ok) {
        // If the HTTP status code is not successful, throw an error
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const confirmationResult = await response.json();

      // Handle the response based on the confirmation result from your server
      if (confirmationResult.success) {
        console.log('Payment was successfully confirmed.');
        navigate(`/subscription/${userId}/payment-success`);
      } else {
        console.log('Payment failed to confirm.');
        setError('Payment confirmation failed. Please try again.');
        navigate(`/subscription/${userId}/payment-failed`);
      }
    } catch (error) {
      console.error(`An error occurred during payment confirmation: ${error}`);
      setError(`An error occurred: ${error.message}`);
      navigate(`/subscription/${userId}/payment-failed`);
    }
  }

  return (
    <>
      <button
        className='absolute top-12 left-0 mx-2 my-1 py-2 px-3 flex items-center rounded-md text-gray-800 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-600 md:top-1 md:left-12'
        onClick={() => navigate(-1)}
      >
        ← {localize(lang, 'com_ui_back')}
      </button>

      <div className="absolute top-24 left-0 right-0 flex justify-center items-center py-4">
        <div className="relative flex items-center justify-center mr-2 text-xl dark:text-gray-200">
          {`${subscriptionUser?.name}'s Plan Management`}
        </div>
      </div>

      {/* Display error message if there's an error */}
      {error && <div className="error-message text-red-500">{error}</div>}

      <div className="mt-10 mx-auto border rounded" style={{ width: '900px', marginTop: '200px' }}>
        {/* Row 1 */}
        <div className="flex w-full">
          <div className="w-1/3 p-2 border border-r bg-green-500 flex items-center justify-center">Pre-paid Plan Options</div>
          <div className="w-1/3 p-2 border border-r bg-green-500 flex items-center justify-center">Payment Option</div>
          <div className="w-1/3 p-2 border bg-green-500 flex items-center justify-center">Plan Due Date</div>
        </div>

        {/* Row 2 */}
        <div className="flex w-full">
          <div className="w-1/3 p-2 border border-r bg-green-500 flex items-center justify-center">by Month: 10 USD/Month</div>
          <div className="w-1/6 p-2 border border-r flex items-center justify-center bg-green-500"> {/* Flex centering added */}
            <button
              onClick={handleSubscription}
              className="w-full h-full text-white rounded bg-blue-600"
            >
              PayPal
            </button>
          </div>
          <div className="w-1/6 p-2 border bg-green-500 flex items-center justify-center">Coming Soon</div>
          <div className="w-1/3 p-2 border bg-green-500 flex items-center justify-center">Plan Due Date</div>
        </div>
      </div>
    </>
  );
}

function Subscription() {
  const { userId } = useParams();
  return <SubscriptionContent key={userId} />;
}

export default Subscription;', can you add this code block to it '// Example frontend code to initiate a payment
function initiatePayment(userId) {
  // Send the userId to your backend
  fetch('http://localhost:3080/api/paypal/create-payment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ userId })
  })
  // Handle the response from your server
    .then(response => response.json())
    .then(data => {
      if (data.approvalUrl) {
      // Redirect user to PayPal approval URL
        window.location.href = data.approvalUrl;
      }
    })
    .catch(error => console.error('Error:', error));
}