import React, { useState } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { useAuthContext } from '~/hooks';
import { PRODUCTS } from './products';
import { useCreateStripeCheckoutSession } from './useCreateStripeCheckoutSession';
import { useCancelSubscription } from './useCancelSubscription';

function Product({ open, onOpenChange }: TDialogProps) {
  const { user, token } = useAuthContext();
  //const { mutate: createCheckoutSession, isLoading: purchasing, variables: subscribingPlan } = useCreateStripeCheckoutSession();
  const [billingLoading, setBillingLoading] = useState(false);
  const navigate = useNavigate();

  const navigateToChat = () => {
    open = false;
    if (onOpenChange)  {
      onOpenChange(open);
    }
  }

  const handleCancel = () => {
    setShowConfirm(true);
  };

  async function handlePurchaseClick(priceId, amount) {
    try {
      // Hardcoded priceId for demo; replace with your actual Stripe Price ID
      const res = await fetch('/api/stripe/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 'Authorization': `Bearer ${token}` // Uncomment if needed
        },
        body: JSON.stringify({
          priceId: priceId, //
          quantity: 1,
          metadata: { tokenAmount: amount}
        }),
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data?.url) {
        window.location.href = data.url;
      } else {
        alert('Purchase failed: ' + (data?.error || res.statusText));
      }
    } catch (error) {
      alert('Purchase failed: ' + (error.message || error));
    }
  }

  const handleBillingPortal = () => {
    setBillingLoading(true);
    fetch('/api/stripe/billing-portal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      credentials: 'include',
    })
      .then(async (res) => {
        const data = await res.json();
        if (data?.url) {
          window.open(data.url, '_blank', 'noopener,noreferrer');
        } else {
          window.alert('Failed to get billing portal URL.');
        }
      })
      .catch((err) => {
        window.alert('Failed to open billing portal: ' + (err?.message || err));
      })
      .finally(() => setBillingLoading(false));
  };

  return (
    <div className="flex flex-col gap-3 p-1 text-sm text-text-primary">      
        <div className="mt-2">
          <h2 className="text-lg font-semibold mb-2">Credits</h2>      
          <p>Manage your credits here.</p> 
        </div>
        <div className="m-auto justify-center p-4 py-2 md:gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <p className="md:col-span-2">The feature you are trying to use requires a subscription, choose a plan that is right for you, cancel any time.</p>
            {PRODUCTS.map((p) => (
              <div
                key={p.id}
                className="flex flex-col md:flex-row md:items-center md:gap-4 border rounded-lg p-4 bg-surface-secondary md:col-span-2"
              >
                <div className="flex flex-col items-center gap-2 mt-4 md:mt-0 min-w-[120px]">
                  <span className="font-semibold text-primary text-lg">{p.price}</span>
                  <button
                    className="px-4 py-2 rounded bg-primary text-white font-medium hover:bg-primary-dark disabled:opacity-60 w-full"
                    onClick={() => handlePurchaseClick(p.id. p.amount)}
                    disabled={purchasing}
                  >
                    {purchasing ? 'Redirecting...' : p.name}
                  </button>
                </div>
              </div>
            ))}        
          </div>
        </div>        
    </div>
  );
}

export default React.memo(Product);
