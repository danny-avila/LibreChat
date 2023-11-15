import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { TUser, useGetUserByIdQuery } from '@librechat/data-provider';
import { useRecoilValue } from 'recoil';
import store from '~/store';
import { localize } from '~/localization/Translation';
import Cookies from 'js-cookie';
import { v4 as uuidv4 } from 'uuid';

function SubscriptionContent() {
  // Moved the darkMode state inside the component
  const [darkMode, setDarkMode] = useState(window.matchMedia('(prefers-color-scheme: dark)').matches);

  const [subscriptionUser, setSubscriptionUser] = useState<TUser | null>(null);
  const [error, setError] = useState(''); // State to hold any error messages
  // The useSearchParams hook should be inside the component
  const [searchParams] = useSearchParams();
  const { userId = '' } = useParams();
  const lang = useRecoilValue(store.lang);
  const navigate = useNavigate();
  const [subscriptionDueDate, setSubscriptionDueDate] = useState('');

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

  useEffect(() => {
    // Moved inside the useEffect
    const matcher = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setDarkMode(e.matches);
    matcher.addEventListener('change', onChange);
    return () => {
      matcher.removeEventListener('change', onChange);
    };
  }, []); // Added setDarkMode to the dependency array

  async function handleSubscription() {
    console.log('handleSubscription function called with userId:', userId);
    setError('');

    const paymentReference = uuidv4(); // Generate a unique payment reference

    try {
      const body = JSON.stringify({
        userId, // Include userId for backend processing
        paymentReference, // Include the generated payment reference
      });

      const token = Cookies.get('token'); // Retrieve the token from the cookies
      console.log('token:', token)

      const response = await fetch('/api/payments/create-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`, // Include the token in the header
        },
        body
      });

      const data = await response.json();
      console.log('Received response from /create-payment:', data);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (data && data.approval_url) {
        console.log('Approval URL received:', data.approval_url);
        window.location.href = data.approval_url;
      } else {
        console.error('Failed to get approval URL');
        setError('Failed to initiate payment. Please try again.');
      }
    } catch (error) {
      console.error(`An error occurred in handleSubscription: ${error}`);
      setError(`An error occurred: ${error.message}`);
    }
  }

  async function handlePaymentConfirmation(paymentStatus, userId, paymentId, payerId) {
    console.log(`handlePaymentConfirmation called with paymentStatus: ${paymentStatus}, userId: ${userId}, paymentId: ${paymentId}, payerId: ${payerId}`);

    try {
      const body = JSON.stringify({
        userId, // Include userId in the body for backend processing
        paymentId,
        payerId,
      });

      const token = Cookies.get('token');

      const response = await fetch('/api/payments/execute-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body
      });

      const confirmationResult = await response.json();
      console.log('Received response from /execute-payment:', confirmationResult);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

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

  // Fetching subscription data
  useEffect(() => {
    const fetchSubscriptionData = async () => {
      try {
        const response = await fetch(`/api/payments/subscription-endtime/${userId}`, {
          headers: {
            'Authorization': `Bearer ${Cookies.get('token')}`,
          },
        });
        const data = await response.json();
        if (response.ok) {
          setSubscriptionDueDate(data.dueTime);
        } else {
          setError(data.message);
        }
      } catch (error) {
        setError('Failed to fetch subscription data');
      }
    };

    fetchSubscriptionData();
  }, [userId]);

  const boxStyles = {
    border: '2px solid #e0e0e0',
    borderRadius: '6px',
    padding: '20px',
    maxWidth: '372px',
    margin: 'auto',
    backgroundColor: darkMode ? '#333' : '#ffffff',
    color: darkMode ? '#ffffff' : '#000000',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    transition: 'background-color 0.3s, color 0.3s', // Smooth transition for color changes
  };

  return (
    <>
      <button
        className='absolute top-12 left-0 mx-2 my-1 py-2 px-3 flex items-center rounded-md text-gray-800 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-600 md:top-1 md:left-12'
        onClick={() => navigate(-1)}
      >
        ← {localize(lang, 'com_ui_back')}
      </button>

      <div style={boxStyles}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{
            fontSize: '1.5rem',
            marginBottom: '0.5rem'
          }}>Plan Subscription</h2>
          <p style={{
            marginBottom: '3rem'
          }}></p>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{
            fontSize: '1.5rem',
            marginBottom: '0.5rem'
          }}>Pricing</h2>
          <ul style={{
            marginBottom: '0.5rem',
            listStyleType: 'disc',
            paddingLeft: '1.5rem',
          }}>
            <li>20 USD / month</li>
          </ul>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{
            fontSize: '1.5rem',
            marginBottom: '0.5rem'
          }}>Expiration Date</h2>
          <ul style={{
            marginBottom: '0.5rem',
            listStyleType: 'disc',
            paddingLeft: '1.5rem',
          }}>
            <li>{subscriptionDueDate ? subscriptionDueDate : 'Loading subscription expiration date...'}</li>
            <li>Please renew you subcription before or at the expiration day!</li>
          </ul>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{
            fontSize: '1.5rem',
            marginBottom: '0.5rem'
          }}>

          </h2>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{
            fontSize: '1.5rem',
            marginBottom: '0rem'
          }}>Payment Method</h2>
        </div>

        <div style={{
          width: '90%',
          padding: '2px',
          border: '1px solid #e0e0e0',
          borderRadius: '6px',
          textAlign: 'center',
          marginLeft: '6%',
        }}>
          <button
            onClick={handleSubscription}
            style={{
              width: '100%',
              padding: '5px 0',
              backgroundColor: '#007bff',
              color: 'white',
              borderRadius: '4px',
              cursor: 'pointer',
              border: 'none',
              fontSize: '22px'
            }}
          >
            PayPal
          </button>
        </div>
      </div>
    </>
  );
}

function Subscription() {
  const { userId } = useParams();
  return <SubscriptionContent key={userId} />;
}

export default Subscription;