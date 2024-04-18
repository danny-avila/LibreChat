import React, { useState, useEffect, useCallback } from 'react';
import { Dialog } from '~/components/ui/';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { useAuthContext } from '../../../hooks/AuthContext';
import { Spinner } from '~/components';
import { useLocalize } from '~/hooks';
import PaymentOptionButton from '~/components/payment/PaymentOptionButton';
import { tokenOptions, tokenOptionsChina } from '~/components/payment/paymentConstants';
import { processBitcoinPayment } from '~/components/payment/BitcoinPayment';
import { processStripePayment } from '~/components/payment/StripePayment';

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

  // Determine the user's domain (China or global)
  const isChina = window.location.hostname.includes('gptchina.io');

  // Select the appropriate token options array based on the user's domain
  const tokenOptionsToUse = isChina ? tokenOptionsChina : tokenOptions;

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

    const selectedOption = tokenOptionsToUse.find((option) => option.tokens === selectedTokens);
    console.log('selectedOption', selectedOption);
    if (!selectedOption) {
      console.error('Invalid token selection');
      return;
    }

    setProcessingTokenAmount(selectedTokens);

    try {
      if (selectedPaymentOption === 'bitcoin') {
        await processBitcoinPayment(selectedTokens, selectedOption, userId, email);
      } else {
        await processStripePayment(selectedOption, selectedPaymentOption, userId, email);
      }
    } catch (error) {
      console.error('Payment error:', error);
    } finally {
      setProcessingTokenAmount(null);
    }
  }, [selectedTokens, selectedPaymentOption, userId, email, tokenOptionsToUse]);

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
              {tokenOptionsToUse.map(({ tokens, label, price }) => (
                <button
                  key={tokens}
                  onClick={() => handleSelect(tokens)}
                  className={`flex h-[100px] flex-col items-center justify-between rounded p-3 text-white ${
                    selectedTokens === tokens
                      ? 'border-4 border-blue-500 bg-green-500'
                      : 'border-4-green-500 border-4 bg-green-500 hover:bg-green-600 dark:hover:bg-green-600'
                  }`}
                >
                  <div className="text-lg font-bold">{localize(label)}</div>
                  <div>{localize('com_ui_payment_tokens')}</div>
                  <div className="text-sm">{localize(price)}</div>
                </button>
              ))}
            </div>

            <div className="my-2 flex w-full items-center">
              <div className="flex-grow border-t border-gray-300"></div>
              <span className="text-md mx-4 flex-shrink bg-transparent px-2 text-gray-700 dark:text-gray-300">
                Select Payment Option
              </span>
              <div className="flex-grow border-t border-gray-300"></div>
            </div>

            <div className="my-4 flex justify-center space-x-4">
              <PaymentOptionButton
                option="wechat_pay"
                isSelected={selectedPaymentOption === 'wechat_pay'}
                onClick={() => setSelectedPaymentOption('wechat_pay')}
              />
              <PaymentOptionButton
                option="alipay"
                isSelected={selectedPaymentOption === 'alipay'}
                onClick={() => setSelectedPaymentOption('alipay')}
              />
              <PaymentOptionButton
                option="card"
                isSelected={selectedPaymentOption === 'card'}
                onClick={() => setSelectedPaymentOption('card')}
              />
              <PaymentOptionButton
                option="bitcoin"
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
