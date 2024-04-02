import React, { useState, useEffect, useCallback } from 'react';
import { Dialog } from '~/components/ui/';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { loadStripe } from '@stripe/stripe-js';
import { useAuthContext } from '../../../hooks/AuthContext';
import { Spinner } from '~/components';
import { SiWechat, SiAlipay } from 'react-icons/si';
import { FaCreditCard, FaCcPaypal, FaBitcoin } from 'react-icons/fa';
import { useLocalize } from '~/hooks';

const stripePromise = loadStripe(
  'pk_live_51MwvEEHKD0byXXCl8IzAvUl0oZ7RE6vIz72lWUVYl5rW3zy0u3FiGtIAgsbmqSHbhkTJeZjs5VEbQMNStaaQL9xQ001pwxI3RP',
);

export default function ErrorDialog({ open, onOpenChange }) {
  const { user } = useAuthContext();
  const userId = user?.id;
  const email = user?.email;
  const [processingTokenAmount, setProcessingTokenAmount] = useState(null);
  const [tokenBalance, setTokenBalance] = useState(null);
  const [selectedTokens, setSelectedTokens] = useState(null);
  const [selectedPaymentOption, setSelectedPaymentOption] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const localize = useLocalize();

  const tokenOptions = [
    {
      tokens: 100000,
      label: localize('com_token_package_label_100k'),
      price: localize('com_token_package_price_100k'),
      amountCNY: 10,
      priceId: 'price_1ORgxoHKD0byXXClx3u1yLa0',
    },
    {
      tokens: 500000,
      label: localize('com_token_package_label_500k'),
      price: localize('com_token_package_price_500k'),
      amountCNY: 35,
      priceId: 'price_1ORgyJHKD0byXXClfvOyCbp7',
    },
    {
      tokens: 1000000,
      label: localize('com_token_package_label_1m'),
      price: localize('com_token_package_price_1m'),
      amountCNY: 50,
      priceId: 'price_1ORgyiHKD0byXXClHetdaI3W',
    },
    {
      tokens: 10000000,
      label: localize('com_token_package_label_10m'),
      price: localize('com_token_package_price_10m'),
      amountCNY: 250,
      priceId: 'price_1ORgzMHKD0byXXClDCm5PkwO',
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
    if (!selectedTokens || !selectedPaymentOption) {
      setErrorMessage('Please select a token package and a payment option.');
      return;
    }

    setErrorMessage('');

    const selectedOption = tokenOptions.find((option) => option.tokens === selectedTokens);
    if (!selectedOption) {
      console.error('Invalid token selection');
      return;
    }

    setProcessingTokenAmount(selectedTokens);

    try {
      if (selectedPaymentOption === 'bitcoin') {
        await processBitcoinPayment(selectedTokens, selectedOption);
      } else if (selectedPaymentOption === 'paypal') {
        await processPayPalPayment(selectedTokens, selectedOption);
      } else {
        await processStripePayment(selectedOption);
      }
    } catch (error) {
      console.error('Payment error:', error);
    } finally {
      setProcessingTokenAmount(null);
    }
  }, [selectedTokens, selectedPaymentOption, userId, email, tokenOptions]);

  const processBitcoinPayment = async (selectedTokens, selectedOption) => {
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
  };

  const processStripePayment = async (selectedOption) => {
    const { priceId } = selectedOption;
    const paymentMethod = selectedPaymentOption;

    const res = await fetch('/api/payment/stripe/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId, userId, domain: 'gptchina.io', email, paymentMethod }),
    });

    console.log('res', res);
    const data = await res.json();
    const stripe = await stripePromise;
    const { error } = await stripe.redirectToCheckout({ sessionId: data.sessionId });
    if (error) {
      console.error('Stripe Checkout Error:', error);
    }
  };

  const PaymentOptionButton = ({ icon: Icon, isSelected, onClick }) => (
    <button
      onClick={onClick}
      className={`rounded p-2 ${
        isSelected ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
      } transition-colors duration-150 hover:bg-blue-600 hover:text-white`}
    >
      <Icon size="2.5em" />
    </button>
  );

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
          <div className="flex w-full flex-col items-center gap-2">
            {errorMessage && (
              <div className="mb-4 rounded bg-red-100 p-4 text-red-700">
                <span>{errorMessage}</span>
              </div>
            )}
            <div className="text-center text-sm dark:text-white">
              Please Note! WeChat and Alipay valid only with a Chinese National ID-linked account
            </div>
            <div className="grid w-full grid-cols-2 gap-5 p-3">
              {tokenOptions.map(({ tokens, label, price, amountCNY }) => (
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

            <div className="my-2 flex w-full items-center">
              <div className="flex-grow border-t border-gray-300"></div>
              <span className="text-md mx-4 flex-shrink bg-white px-2 text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                Select Payment Option
              </span>
              <div className="flex-grow border-t border-gray-300"></div>
            </div>

            <div className="my-4 flex justify-center space-x-4">
              <PaymentOptionButton
                icon={SiWechat}
                isSelected={selectedPaymentOption === 'wechat_pay'}
                onClick={() => setSelectedPaymentOption('wechat_pay')}
              />
              <PaymentOptionButton
                icon={SiAlipay}
                isSelected={selectedPaymentOption === 'alipay'}
                onClick={() => setSelectedPaymentOption('alipay')}
              />
              <PaymentOptionButton
                icon={FaCreditCard}
                isSelected={selectedPaymentOption === 'card'}
                onClick={() => setSelectedPaymentOption('card')}
              />
              <PaymentOptionButton
                icon={FaBitcoin}
                isSelected={selectedPaymentOption === 'bitcoin'}
                onClick={() => setSelectedPaymentOption('bitcoin')}
              />
            </div>

            <button
              onClick={handlePurchase}
              disabled={processingTokenAmount !== null}
              className="mt-2 w-full rounded bg-green-500 p-2 text-white hover:bg-green-600 dark:hover:bg-green-600"
            >
              <span className="inline-flex items-center justify-center">
                {processingTokenAmount !== null ? <Spinner /> : 'Purchase - 购买'}
              </span>
            </button>
          </div>
        }
      />
    </Dialog>
  );
}
