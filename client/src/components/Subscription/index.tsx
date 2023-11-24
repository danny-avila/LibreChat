import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { TUser, useGetUserByIdQuery } from '@librechat/data-provider';
import { useRecoilValue } from 'recoil';
import store from '~/store';
import { localize } from '~/localization/Translation';
import Cookies from 'js-cookie';
import { v4 as uuidv4 } from 'uuid';
import { loadStripe } from '@stripe/stripe-js';

const STRIPE_PUBLIC_KEY = import.meta.env.VITE_STRIPE_PUBLIC_KEY

function SubscriptionContent() {
  const [darkMode, setDarkMode] = useState(window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [subscriptionUser, setSubscriptionUser] = useState<TUser | null>(null);
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();
  const { userId = '' } = useParams();
  const lang = useRecoilValue(store.lang);
  const navigate = useNavigate();
  const [subscriptionDueDate, setSubscriptionDueDate] = useState('');

  const getUserByIdQuery = useGetUserByIdQuery(userId);

  const subscriptionOptions = [
    {
      planId: 'month',
      price: '120.00',
      currencySymbol: '￥',
      benefits: 'Unlimited Quota',
      name: 'Monthly Plan'
    },
    {
      planId: 'quarter',
      price: '320.00',
      currencySymbol: '￥',
      benefits: '10% Monthly Savings',
      name: 'Quarterly Plan'
    },
    {
      planId: 'year',
      price: '1100.00',
      currencySymbol: '￥',
      benefits: '20% Monthly Savings',
      name: 'Yearly Plan'
    }
  ];

  // Effect for fetching user data
  useEffect(() => {
    if (getUserByIdQuery.isSuccess) {
      setSubscriptionUser(getUserByIdQuery.data);
    }
  }, [getUserByIdQuery.isSuccess, getUserByIdQuery.data]);

  // Effect for handling payment status confirmation
  useEffect(() => {
    const paymentStatus = searchParams.get('paymentStatus');
    const paymentId = searchParams.get('paymentId');
    const payerId = searchParams.get('PayerID');
    if (paymentStatus) {
      handlePayPalPaymentConfirmation(paymentStatus, userId, paymentId, payerId);
    }
  }, [searchParams, userId, handlePayPalPaymentConfirmation]);

  //Effect for darkmode
  useEffect(() => {
    const matcher = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setDarkMode(e.matches);
    matcher.addEventListener('change', onChange);
    return () => {
      matcher.removeEventListener('change', onChange);
    };
  }, []);

  async function handleSubscription(paymentMethod, planType) {
    console.log(`handleSubscription function called with userId: ${userId} and paymentMethod: ${paymentMethod}`);
    setError('');

    const selectedPlan = subscriptionOptions.find(plan => plan.planId === planType);
    if (!selectedPlan) {
      console.error('Selected plan not found');
      setError('Invalid plan selected');
      return;
    }

    const paymentReference = uuidv4();
    const amountToCharge = selectedPlan.price;

    try {
      const body = JSON.stringify({
        userId, // Include userId for backend processing
        paymentReference, // Include the generated payment reference
        amount: amountToCharge
      });

      const token = Cookies.get('token');
      console.log('token:', token)

      // Select the endpoint based on the payment method
      let endpoint = '';
      switch (paymentMethod) {
        case 'paypal':
          endpoint = '/api/payments/create-payment-paypal';
          break;
        case 'wechat_pay':
          endpoint = '/api/payments/create-payment-wechatpay';
          break;
        case 'alipay':
          endpoint = '/api/payments/create-payment-alipay';
          break;
        default:
          throw new Error('Unsupported payment method');
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body
      })

      const data = await response.json();
      console.log('Received response from /create-payment:', data);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Handle response based on payment method
      if (paymentMethod === 'paypal' && data.approval_url) {
        window.location.href = data.approval_url;
      } else if (paymentMethod === 'wechat_pay') {
        if (data.sessionId) {
          console.log('Stripe Public Key:', STRIPE_PUBLIC_KEY);
          const stripe = await loadStripe(STRIPE_PUBLIC_KEY);
          stripe.redirectToCheckout({ sessionId: data.sessionId });
          console.log(`{ sessionId:, ${data.sessionId} }`)
        } else {
          console.error('No session ID in the response for WeChat Pay');
          setError('Failed to initiate WeChat Pay. Please try again.');
        }
      } else if (paymentMethod === 'alipay') {
        if (data.sessionId) {
          // For Alipay, the redirection to the Stripe Checkout is also necessary
          console.log('Stripe Public Key:', STRIPE_PUBLIC_KEY);
          const stripe = await loadStripe(STRIPE_PUBLIC_KEY);
          stripe.redirectToCheckout({ sessionId: data.sessionId });
          console.log(`Alipay Session ID: ${data.sessionId}`);
        } else {
          console.error('No session ID in the response for Alipay');
          setError('Failed to initiate Alipay. Please try again.');
        }
      } else {
        throw new Error('Unsupported payment method');
      }
    } catch (error) {
      console.error(`An error occurred in handleSubscription: ${error}`);
      setError(`An error occurred: ${error.message}`);
    }
  }

  async function handlePayPalPaymentConfirmation(paymentStatus, userId, paymentId, payerId) {
    console.log(
      `handlePaypalPaymentConfirmation called with paymentStatus: ${paymentStatus},` +
      `userId: ${userId}, paymentId: ${paymentId}, payerId: ${payerId}`);

    try {
      const body = JSON.stringify({
        userId,
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

  const subscriptionContainerStyles = {
    display: 'flex',
    justifyContent: 'space-around', // This will add space around each item.
    padding: '20px',
    maxWidth: '1200px', // Adjust as needed
    margin: 'auto'
  };

  const boxStyles = {
    border: '2px solid #e0e0e0',
    borderRadius: '6px',
    padding: '20px',
    width: '30%', // Adjust the width as needed
    margin: '0 10px', // Adds horizontal margin between boxes
    backgroundColor: darkMode ? '#333' : '#ffffff',
    color: darkMode ? '#ffffff' : '#000000',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    transition: 'background-color 0.3s, color 0.3s',
    // If you want to ensure that the boxes don't stick to each other on smaller screens:
    minWidth: '250px' // Adjust minimum width as needed
  };

  return (
    <>
      <button
        className={
          'absolute top-12 left-0 mx-2 my-1 py-2 px-3 ' +
          'flex items-center rounded-md text-gray-800 ' +
          'hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-600 ' +
          'md:top-1 md:left-12'
        }
        onClick={() => navigate(-1)}
      >
        ← {localize(lang, 'com_ui_back')}
      </button>

      <div style={subscriptionContainerStyles}>
        {subscriptionOptions.map(option => (
          <div key={option.planId} style={boxStyles}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', textAlign: 'center' }}>
              {option.name}
            </h2>
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{
                fontSize: '1.5rem',
                marginBottom: '0.5rem'
              }}>{localize(lang, 'com_ui_pricing')}:</h2>
              <ul style={{
                marginBottom: '0.5rem',
                listStyleType: 'disc',
                paddingLeft: '1.5rem',
              }}>
                <li>{option.currencySymbol}{option.price}</li>
                <li>{option.benefits}</li>
              </ul>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{
                fontSize: '1.5rem',
                marginBottom: '0.5rem'
              }}>{localize(lang, 'com_ui_expiration_date')}:</h2>
              <ul style={{
                marginBottom: '0.5rem',
                listStyleType: 'disc',
                paddingLeft: '1.5rem',
              }}>
                <li>{subscriptionDueDate ? subscriptionDueDate : 'Loading subscription expiration date...'}</li>
                <li>{localize(lang, 'com_ui_reminder')}</li>
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
              }}>{localize(lang, 'com_ui_payment_method')}:</h2>
            </div>

            <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
              <div style={{ marginBottom: '10px' }}>
                <button
                  onClick={() => handleSubscription('paypal', option.planId)}
                  style={{
                    width: '90%',
                    padding: '10px',
                    backgroundColor: '#108ee9',
                    color: 'white',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    border: 'none',
                    fontSize: '16px',
                    margin: '0 auto'
                  }}
                >
                PayPal
                </button>
              </div>

              <div style={{ marginBottom: '10px' }}>
                <button
                  onClick={() => handleSubscription('wechat_pay', option.planId)}
                  style={{
                    width: '90%',
                    padding: '10px',
                    backgroundColor: '#108ee9',
                    color: 'white',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    border: 'none',
                    fontSize: '16px',
                    margin: '0 auto'
                  }}
                >
              WeChat Pay
                </button>
              </div>

              <div style={{ marginBottom: '10px' }}>
                <button
                  onClick={() => handleSubscription('alipay', option.planId)}
                  style={{
                    width: '90%',
                    padding: '10px',
                    backgroundColor: '#108ee9',
                    color: 'white',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    border: 'none',
                    fontSize: '16px',
                    margin: '0 auto'
                  }}
                >
              Alipay
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Subscription() {
  const { userId } = useParams();
  return <SubscriptionContent key={userId} />;
}

export default Subscription;