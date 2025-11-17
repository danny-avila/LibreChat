import React, { useState } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { useAuthContext } from '~/hooks';
import { PRODUCTS } from './products';
import { useCreateStripeCheckoutSession } from './useCreateStripeCheckoutSession';
import { useCancelSubscription } from './useCancelSubscription';

function Product({ open, onOpenChange }: TDialogProps) {
  const { user, token } = useAuthContext();
  //const { mutate: createCheckoutSession, isLoading: purchasing, variables: subscribingPlan } = useCreateStripeCheckoutSession();
  const [purchasing, setPurchasing] = useState('');
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
      setPurchasing(priceId);
      // Hardcoded priceId for demo; replace with your actual Stripe Price ID
      const res = await fetch('/api/stripe/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
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
    } finally {
      setPurchasing(false);
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
        {PRODUCTS.map((p) => (
          <div
            key={p.id}
            className="flex flex-col md:flex-row px-4 py-2 md:items-center md:gap-4 md:col-span-2"
          >
            <button
              className="px-4 py-2 rounded bg-primary text-white font-medium hover:bg-primary-dark disabled:opacity-60 w-full"
              onClick={() => handlePurchaseClick(p.id, p.amount)}
              disabled={purchasing}
            >
              <span className="font-semibold text-secondary text-lg">
                {(purchasing === p.id) ? 'Redirecting...' : `${p.name}` }
              </span>
            </button>
          </div>
        ))}        
      </div>
    </div>        
  );
}

export default React.memo(Product);
