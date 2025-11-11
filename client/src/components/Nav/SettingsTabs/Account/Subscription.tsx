import React, { useState } from 'react';
import { useAuthContext } from '~/hooks';
import { PLANS } from './plans';
import { useCreateStripeCheckoutSession } from './useCreateStripeCheckoutSession';
import { useCancelSubscription } from './useCancelSubscription';

function Subscription() {
  const { subscriptionStatus, user, token } = useAuthContext();
  const plan = user?.subscriptionPlan || '';
  const { mutate: createCheckoutSession, isLoading: subscribing, variables: subscribingPlan } = useCreateStripeCheckoutSession();
  const { mutate: cancelSubscription, isLoading: canceling } = useCancelSubscription();
  const [showConfirm, setShowConfirm] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);

  const getPlanName = (planId: string) => {
    const plan = PLANS.find((p) => p.id === planId);
    return plan ? plan.name : 'None';
  }

  const handleSubscribe = (planId: string) => {
    createCheckoutSession(planId, {
      onSuccess: (data) => {
        if (data?.url) {
          window.location.href = data.url;
        } else {
          window.alert('Failed to get Stripe Checkout URL.');
        }
      },
      onError: (err: any) => {
        window.alert('Failed to subscribe: ' + (err?.response?.data?.error || err.message));
      },
    });
  };

  const handleCancel = () => {
    setShowConfirm(true);
  };

  const confirmCancel = () => {
    setShowConfirm(false);
    cancelSubscription(undefined, {
      onSuccess: () => {
        window.alert('Subscription canceled.');
        window.location.reload();
      },
      onError: (err: any) => {
        window.alert('Failed to cancel: ' + (err?.response?.data?.error || err.message));
      },
    });
  };

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

  const displayStatus = (status: string) => {
    return (status) ? status?.charAt(0).toUpperCase() + status.slice(1) : 'Loading...'
  }

  const hasPlan = !!plan && plan !== 'None' && subscriptionStatus === 'active';

  return (
    <div className="flex flex-col gap-3 p-1 text-sm text-text-primary">      
      {hasPlan ? (
        <div className="mt-2">
          <h2 className="text-lg font-semibold mb-2">Subscription</h2>      
          <p>Manage your subscription plan, view your current status, and update payment details here.</p>
          <div className="mt-4">
            <span className="font-medium">Current Status:</span>
            <span className="inline-block rounded px-2 py-1 bg-surface-tertiary text-text-secondary">
              {displayStatus(subscriptionStatus)}
            </span>
          </div>
          <div className="mt-2">
            <span className="font-medium">Current Plan:</span>
            <span className="inline-block rounded px-2 py-1 bg-surface-tertiary text-text-secondary">
              {hasPlan ? getPlanName(plan) : 'None'}
            </span>
          </div>        
          <div className="mt-6 flex gap-4">
            <button
              className="px-4 py-2 rounded bg-surface-secondary text-text-primary font-medium hover:bg-surface-tertiary disabled:opacity-60 border border-primary"
              onClick={handleBillingPortal}
              disabled={billingLoading}
            >
              {billingLoading ? 'Loading...' : 'Update Billing Info'}
            </button>
            <button
              className="px-4 py-2rounded-lg text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-surface-destructive text-destructive-foreground hover:bg-surface-destructive-hover h-10 px-4 py-2"
              onClick={handleCancel}
              disabled={canceling}
            >
              {canceling ? 'Canceling...' : 'Cancel Subscription'}
            </button>            
            {showConfirm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
                <div className="bg-white dark:bg-surface-primary rounded-lg p-6 shadow-xl flex flex-col gap-4 min-w-[300px]">
                  <div className="text-lg font-semibold">Cancel Subscription</div>
                  <div>Are you sure you want to cancel your subscription? This action cannot be undone.</div>
                  <div className="flex gap-4 justify-end mt-2">
                    <button
                      className="px-4 py-2 rounded bg-surface-secondary text-text-primary hover:bg-surface-tertiary"
                      onClick={() => setShowConfirm(false)}
                    >
                      Keep Subscription
                    </button>
                    <button
                      className="px-4 py-2rounded-lg text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-surface-destructive text-destructive-foreground hover:bg-surface-destructive-hover h-10 px-4 py-2"
                      onClick={confirmCancel}
                    >
                      Yes, Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="m-auto justify-center p-4 py-2 md:gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <h2 className="text-lg font-semibold mb-2 md:col-span-2">Available Plans</h2>
            <p className="md:col-span-2">Choose a plan that is right for you, cancel any time.</p>
            {PLANS.map((p) => (
              <div
                key={p.id}
                className="flex flex-col md:flex-row md:items-center md:gap-4 border rounded-lg p-4 bg-surface-secondary md:col-span-2"
              >
                <div className="flex-1">
                  <div className="font-medium text-lg">{p.name}</div>
                  <div className="text-text-secondary">{p.description}</div>
                </div>
                <div className="flex flex-col items-center gap-2 mt-4 md:mt-0 min-w-[120px]">
                  <span className="font-semibold text-primary text-lg">{p.price}</span>
                  <button
                    className="px-4 py-2 rounded bg-primary text-white font-medium hover:bg-primary-dark disabled:opacity-60 w-full"
                    onClick={() => handleSubscribe(p.id)}
                    disabled={subscribing && subscribingPlan === p.id}
                  >
                    {subscribing && subscribingPlan === p.id ? 'Redirecting...' : 'Subscribe'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>        
        // <div>
        //   <h2 className="text-lg font-semibold mb-2">Available Plans</h2>
        //   <p>Choose a plan that is right for you, cancel any time.</p>
        //   <div className="flex flex-col gap-4">
        //     {PLANS.map((p) => (
        //       <div key={p.id} className="flex flex-col md:flex-row md:items-center md:gap-4 border rounded-lg p-4 bg-surface-secondary">
        //         <div className="flex-1">
        //           <div className="font-medium text-lg">{p.name}</div>
        //           <div className="text-text-secondary">{p.description}</div>
        //         </div>
        //         <div className="flex items-center gap-4 mt-2 md:mt-0">
        //           <span className="font-semibold text-primary">{p.price}</span>
        //           <button
        //             className="px-4 py-2 rounded bg-primary text-white font-medium hover:bg-primary-dark disabled:opacity-60"
        //             onClick={() => handleSubscribe(p.id)}
        //             disabled={subscribing && subscribingPlan === p.id}
        //           >
        //             {subscribing && subscribingPlan === p.id ? 'Redirecting...' : 'Subscribe'}
        //           </button>
        //         </div>
        //       </div>
        //     ))}
        //   </div>
        // </div>
      )}
      {/* TODO: Add plan info and Stripe integration UI */}
    </div>
  );
}

export default React.memo(Subscription);
