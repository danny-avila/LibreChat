import React, { useState, useEffect, useCallback } from 'react';
import { Dialog } from '~/components/ui/';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { loadStripe } from '@stripe/stripe-js';
import { useAuthContext } from '../../../hooks/AuthContext.tsx';
import { Spinner } from '~/components';
import { SiWechat, SiAlipay } from 'react-icons/si';
import { FaCreditCard, FaCcPaypal, FaBitcoin } from 'react-icons/fa';
import { useLocalize } from '~/hooks';

const stripePromise = loadStripe(
  'pk_live_51MwvEEHKD0byXXCl8IzAvUl0oZ7RE6vIz72lWUVYl5rW3zy0u3FiGtIAgsbmqSHbhkTJeZjs5VEbQMNStaaQL9xQ001pwxI3RP',
);

const getPriceId = (selectedTokens) => {
  switch (selectedTokens) {
    case 100000:
      return 'price_1ORgxoHKD0byXXClx3u1yLa0';
    case 500000:
      return 'price_1ORgyJHKD0byXXClfvOyCbp7';
    case 1000000:
      return 'price_1ORgyiHKD0byXXClHetdaI3W';
    case 10000000:
      return 'price_1ORgzMHKD0byXXClDCm5PkwO';
    default:
      return null;
  }
};

export default function ErrorDialog({ open, onOpenChange }) {
  const { user } = useAuthContext();
  const userId = user?.id;
  const email = user?.email;
  const [processingTokenAmount, setProcessingTokenAmount] = useState(null);
  const [tokenBalance, setTokenBalance] = useState(null);
  const [selectedTokens, setSelectedTokens] = useState(null);
  const [selectedPaymentOption, setSelectedPaymentOption] = useState(null);
  const localize = useLocalize();

  const tokenOptions = [
    {
      tokens: 100000,
      label: localize('com_token_package_label_100k'),
      price: localize('com_token_package_price_100k'),
      amountCNY: 10,
    },
    {
      tokens: 500000,
      label: localize('com_token_package_label_500k'),
      price: localize('com_token_package_price_500k'),
      amountCNY: 35,
    },
    {
      tokens: 1000000,
      label: localize('com_token_package_label_1m'),
      price: localize('com_token_package_price_1m'),
      amountCNY: 50,
    },
    {
      tokens: 10000000,
      label: localize('com_token_package_label_10m'),
      price: localize('com_token_package_price_10m'),
      amountCNY: 250,
    },
  ];

  const fetchTokenBalance = useCallback(async () => {
    try {
      const response = await fetch('/api/balance');
      const balance = await response.text();
      setTokenBalance(balance);
    } catch (error) {
      console.error('Error fetching token balance:', error);
    }
  }, []);

  const handleSelect = useCallback((tokens) => {
    setSelectedTokens(tokens);
  }, []);

  const handlePurchase = useCallback(async () => {
    if (selectedTokens === null || selectedPaymentOption === null) {return;}

    // Find the selected token option to get its CNY amount and price ID
    const selectedOption = tokenOptions.find((option) => option.tokens === selectedTokens);
    if (!selectedOption) {
      console.error('Invalid token selection');
      return;
    }

    const priceId = getPriceId(selectedTokens);
    if (!priceId) {
      console.error('Invalid token selection for price ID');
      return;
    }

    setProcessingTokenAmount(selectedTokens);

    try {
      if (selectedPaymentOption === 'bitcoin') {
        console.log('Processing Bitcoin payment for', selectedTokens);
        const description = `Purchase of ${selectedTokens} tokens`;
        const response = await fetch('/api/payment/opennode/create-bitcoin-charge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            amount: selectedTokens,
            amountCNY: selectedOption.amountCNY,
            selectedTokens: selectedTokens,
            email: email,
            description,
          }),
        });
        const data = await response.json();
        if (data.hosted_checkout_url) {
          window.location.href = data.hosted_checkout_url;
        } else {
          console.error(
            'Failed to initiate Bitcoin payment',
            data.error || 'Missing hosted_checkout_url',
          );
        }
      } else if (selectedPaymentOption === 'paypal') {
        console.log('Processing PayPal payment for', selectedTokens);
        const response = await fetch('/api/payment/paypal/create-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            amount: selectedTokens,
          }),
        });
        const data = await response.json();
        if (data && data.links) {
          const approvalUrl = data.links.find((link) => link.rel === 'approve').href;
          if (approvalUrl) {
            window.location.href = approvalUrl;
          } else {
            console.error('No approval URL found');
          }
        } else {
          console.error('Failed to initiate PayPal payment', data.error || 'Missing data');
        }
      } else {
        // Default to Stripe logic
        const res = await fetch('/api/payment/stripe/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priceId, userId, domain: 'gptchina.io', email }),
        });
        const data = await res.json();
        const stripe = await stripePromise;
        const { error } = await stripe.redirectToCheckout({ sessionId: data.sessionId });
        if (error) {
          console.error('Stripe Checkout Error:', error);
        }
      }
    } catch (error) {
      console.error('Payment error:', error);
    } finally {
      setProcessingTokenAmount(null);
    }
  }, [selectedTokens, selectedPaymentOption, userId, email, tokenOptions]);

  useEffect(() => {
    if (open) {
      fetchTokenBalance();
    }
  }, [open, fetchTokenBalance]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTemplate
        title={localize('com_ui_payment_title')}
        className="max-w-[450px]"
        main={
          <>
            <div className="flex w-full flex-col items-center gap-2">
              <div className="text-center text-sm dark:text-white">
                Please Note! WeChat and Alipay valid only with a Chinese National ID-linked account
              </div>
              <div className="grid w-full grid-cols-2 gap-5 p-3">
                {tokenOptions.map(({ tokens, label, price }) => (
                  <button
                    key={tokens}
                    onClick={() => handleSelect(tokens)}
                    className={`flex h-[100px] flex-col items-center justify-between rounded p-3 text-white ${
                      selectedTokens === tokens
                        ? 'border-4 border-blue-500 bg-green-500'
                        : 'border-4-green-500 border-4 bg-green-500 hover:bg-green-600 dark:hover:bg-green-600'
                    }`}
                  >
                    <div className="text-lg font-bold">{label}</div>
                    <div>{localize('com_ui_payment_tokens')}</div>
                    <div className="text-sm">{price}</div>
                  </button>
                ))}
              </div>
              <div className="my-4 flex justify-center space-x-4">
                {/* WeChat */}
                <button
                  onClick={() => setSelectedPaymentOption('wechat')}
                  className={`rounded p-2 ${
                    selectedPaymentOption === 'wechat'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700'
                  } transition-colors duration-150 hover:bg-blue-600 hover:text-white`}
                >
                  <SiWechat size="2.5em" />
                </button>

                {/* Alipay */}
                <button
                  onClick={() => setSelectedPaymentOption('alipay')}
                  className={`rounded p-2 ${
                    selectedPaymentOption === 'alipay'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700'
                  } transition-colors duration-150 hover:bg-blue-600 hover:text-white`}
                >
                  <SiAlipay size="2.5em" />
                </button>

                {/* Credit Card */}
                <button
                  onClick={() => setSelectedPaymentOption('creditCard')}
                  className={`rounded p-2 ${
                    selectedPaymentOption === 'creditCard'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700'
                  } transition-colors duration-150 hover:bg-blue-600 hover:text-white`}
                >
                  <FaCreditCard size="2.5em" />
                </button>

                {/* PayPal */}
                <button
                  onClick={() => setSelectedPaymentOption('paypal')}
                  className={`rounded p-2 ${
                    selectedPaymentOption === 'paypal'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700'
                  } transition-colors duration-150 hover:bg-blue-600 hover:text-white`}
                >
                  <FaCcPaypal size="2.5em" />
                </button>

                {/* BitCoin */}
                <button
                  onClick={() => setSelectedPaymentOption('bitcoin')}
                  className={`rounded p-2 ${
                    selectedPaymentOption === 'bitcoin'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700'
                  } transition-colors duration-150 hover:bg-blue-600 hover:text-white`}
                >
                  <FaBitcoin size="2.5em" />
                </button>
              </div>

              <button
                onClick={handlePurchase}
                disabled={
                  selectedTokens === null ||
                  selectedPaymentOption === null ||
                  processingTokenAmount !== null
                }
                className="mt-2 w-full rounded bg-green-500 p-2 text-white hover:bg-green-600 dark:hover:bg-green-600"
              >
                {processingTokenAmount !== null ? <Spinner /> : 'Purchase - 购买'}
              </button>
            </div>
          </>
        }
      />
    </Dialog>
  );
}
