import React, { useState, useEffect } from 'react';
import { Dialog, Label } from '~/components/ui/';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { useAuthContext } from '../../../hooks/AuthContext.tsx';
import { Spinner } from '~/components';

const stripePromise = loadStripe(
  'pk_live_51MwvEEHKD0byXXCl8IzAvUl0oZ7RE6vIz72lWUVYl5rW3zy0u3FiGtIAgsbmqSHbhkTJeZjs5VEbQMNStaaQL9xQ001pwxI3RP',
);

export default function ErrorDialog({ open, onOpenChange, message }) {
  const { user } = useAuthContext();
  const userId = user?.id;
  const [processingTokenAmount, setProcessingTokenAmount] = useState(null);
  const [tokenBalance, setTokenBalance] = useState(null);
  const title = 'Purchase Tokens';

  const fetchTokenBalance = async () => {
    try {
      const response = await fetch('/api/balance');
      const balance = await response.text();
      setTokenBalance(balance);
    } catch (error) {
      console.error('Error fetching token balance:', error);
    }
  };

  const handlePurchase = async (tokens) => {
    setProcessingTokenAmount(tokens);
    let amount;
    switch (tokens) {
      case 100000:
        amount = 10;
        break;
      case 500000:
        amount = 35;
        break;
      case 1000000:
        amount = 50;
        break;
      case 10000000:
        amount = 250;
        break;
      default:
        console.error('Invalid token amount');
        return;
    }

    try {
      const res = await fetch('/api/payment/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount, userId: userId }),
      });
      const data = await res.json();
      const stripe = await stripePromise;
      const { error } = await stripe.redirectToCheckout({
        sessionId: data.sessionId,
      });
      if (error) {
        console.error(error);
      } else {
        await fetchTokenBalance();
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setProcessingTokenAmount(null);
    }
  };

  useEffect(() => {
    if (open) {
      fetchTokenBalance(); // Fetch token balance when dialog opens
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTemplate
        title={title}
        className="max-w-[450px]"
        main={
          <>
            <div className="flex w-full flex-col items-center gap-2">
              <div className="text-center text-sm text-gray-100">
                Please Note! WeChat and Alipay valid only with a Chinese National ID-linked account
              </div>
              <div className="grid w-full grid-cols-2 gap-5 p-3">
                <Label htmlFor="chatGptLabel" className="col-span-2 text-left text-sm font-medium">
                  {message}
                </Label>
                <Elements stripe={stripePromise}>
                  {[
                    { tokens: 100000, label: '100k', price: '10 RMB' },
                    { tokens: 500000, label: '500k', price: '35 RMB' },
                    { tokens: 1000000, label: '1 Million', price: '50 RMB' },
                    { tokens: 10000000, label: '10 Million', price: '250 RMB' },
                  ].map(({ tokens, label, price }) => (
                    <button
                      key={tokens}
                      onClick={() => handlePurchase(tokens)}
                      disabled={processingTokenAmount !== null}
                      className="flex h-[100px] flex-col items-center justify-between rounded bg-green-500 p-3 text-white hover:bg-green-600 dark:hover:bg-green-600"
                    >
                      {processingTokenAmount === tokens ? (
                        <Spinner />
                      ) : (
                        <>
                          <div className="text-lg font-bold">{label}</div>
                          <div>Tokens</div>
                          <div className="text-sm">{price}</div>
                        </>
                      )}
                    </button>
                  ))}
                </Elements>
              </div>
            </div>
          </>
        }
      />
    </Dialog>
  );
}
