import React, { useState, useEffect } from 'react';
import { Dialog, Label } from '~/components/ui/';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { useAuthContext } from '../../../hooks/AuthContext.tsx';

const stripePromise = loadStripe(
  'pk_live_51MwvEEHKD0byXXCl8IzAvUl0oZ7RE6vIz72lWUVYl5rW3zy0u3FiGtIAgsbmqSHbhkTJeZjs5VEbQMNStaaQL9xQ001pwxI3RP',
);

export default function ErrorDialog({ message }) {
  const { user } = useAuthContext();
  const userId = user?.id;
  const [loading, setLoading] = useState(false);
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
    setLoading(true);
    let amount;
    switch (tokens) {
      case 100000:
        amount = 20;
        break;
      case 250000:
        amount = 40;
        break;
      case 500000:
        amount = 65;
        break;
      case 1000000:
        amount = 100;
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
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokenBalance(); // Fetch token balance on component mount
  }, []);

  return (
    <Dialog defaultOpen={true}>
      <DialogTemplate
        title={title}
        className="max-w-[450px]"
        main={
          <>
            <div className="flex w-full flex-col items-center gap-2">
              <div className="grid w-full items-center gap-2">
                <Label htmlFor="chatGptLabel" className="text-left text-sm font-medium">
                  {message}
                </Label>
                <Elements stripe={stripePromise}>
                  <button
                    onClick={() => handlePurchase(100000)}
                    disabled={loading}
                    className="rounded bg-green-600 p-2 text-white hover:bg-green-700 dark:hover:bg-green-800"
                  >
                    {loading ? 'Processing...' : 'Purchase 100k Tokens for 20 RMB'}
                  </button>
                  <button
                    onClick={() => handlePurchase(250000)}
                    disabled={loading}
                    className="rounded bg-green-600 p-2 text-white hover:bg-green-700 dark:hover:bg-green-800"
                  >
                    {loading ? 'Processing...' : 'Purchase 250k Tokens for 40 RMB'}
                  </button>
                  <button
                    onClick={() => handlePurchase(500000)}
                    disabled={loading}
                    className="rounded bg-green-600 p-2 text-white hover:bg-green-700 dark:hover:bg-green-800"
                  >
                    {loading ? 'Processing...' : 'Purchase 500k Tokens for 65 RMB'}
                  </button>
                  <button
                    onClick={() => handlePurchase(1000000)}
                    disabled={loading}
                    className="rounded bg-green-600 p-2 text-white hover:bg-green-700 dark:hover:bg-green-800"
                  >
                    {loading ? 'Processing...' : 'Purchase 1 Million Tokens for 100 RMB'}
                  </button>
                </Elements>
              </div>
            </div>
          </>
        }
      />
    </Dialog>
  );
}
