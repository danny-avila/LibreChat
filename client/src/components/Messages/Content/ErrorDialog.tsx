import React, { useState } from 'react';
import { Dialog, Label } from '~/components/ui/';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(
  'pk_test_51MwvEEHKD0byXXClhlIY96bsuIIIcdGgTenVqBnktRp8fzoUHlcI29yTj9ktyqumu2Xk1uz7KptFryWfTZz5Sdj200f3cPZSa3',
);

export default function ErrorDialog({ message }) {
  const [loading, setLoading] = useState(false);
  const title = 'Insufficient Funds';

  const handlePurchase = async (amount) => {
    setLoading(true);
    try {
      const res = await fetch('/api/payment/create-payment-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount, userId: 'your-user-id' }),
      });
      const data = await res.json();
      const stripe = await stripePromise;
      const { error } = await stripe.redirectToCheckout({
        sessionId: data.sessionId,
      });
      if (error) {
        console.error(error);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

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
                    onClick={() => handlePurchase(2000)} // Replace 2000 with the amount in cents
                    disabled={loading}
                    className="rounded bg-green-600 p-2 text-white hover:bg-green-700 dark:hover:bg-green-800"
                  >
                    {loading ? 'Processing...' : 'Purchase 100k Tokens for 20 RMB'}
                  </button>
                  <button
                    onClick={() => handlePurchase(4000)} // Replace 4000 with the amount in cents
                    disabled={loading}
                    className="rounded bg-green-600 p-2 text-white hover:bg-green-700 dark:hover:bg-green-800"
                  >
                    {loading ? 'Processing...' : 'Purchase 250k Tokens for 40 RMB'}
                  </button>
                  {/* Add more buttons for other amounts */}
                </Elements>
              </div>
            </div>
          </>
        }
      />
    </Dialog>
  );
}
