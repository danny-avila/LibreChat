import React, { useState, useMemo, useEffect } from 'react';
import { CheckIcon, Loader2 } from 'lucide-react';
import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle, Button } from '~/components/ui';
import { useLocalize } from '~/hooks';
import {
  useCreateOmnexioSubscription,
  useChangeOmnexioSubscription,
  useGetOmnexioSubscriptionPlans,
} from '~/data-provider';

interface SubscriptionPlan {
  id: number;
  name: string;
  price: string;
  features: string[];
  buttonText: string;
  recommended?: boolean;
  onClick: () => void;
  isDisabled?: boolean;
}

interface SubscriptionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ open, onOpenChange }) => {
  const localize = useLocalize();
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [confirmationPlan, setConfirmationPlan] = useState<number | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const createSubscription = useCreateOmnexioSubscription();
  const changeSubscription = useChangeOmnexioSubscription();
  const subscriptionPlansQuery = useGetOmnexioSubscriptionPlans();

  // Refetch subscription plans when the modal is opened
  useEffect(() => {
    if (open) {
      subscriptionPlansQuery.refetch();
    }
  }, [open, subscriptionPlansQuery]);

  // Transform API subscription plans to the format expected by the component
  const subscriptionPlans = useMemo(() => {
    if (!subscriptionPlansQuery.data || subscriptionPlansQuery.data.length === 0) {
      return []; // Return empty array if no plans are available
    }

    // Find the current plan for reference
    const currentPlanIndex = subscriptionPlansQuery.data.findIndex((plan) => plan.isCurrent);

    return subscriptionPlansQuery.data.map((plan, index) => {
      // Determine the appropriate button text based on position relative to current plan
      const buttonText = plan.isCurrent
        ? localize('com_subscription_current_plan')
        : index < currentPlanIndex
          ? localize('com_subscription_downgrade')
          : localize('com_subscription_upgrade');

      return {
        id: parseInt(plan.id),
        name: plan.name,
        price: plan.label,
        features: plan.features,
        buttonText,
        recommended: plan.isRecommended,
        onClick: () => handlePlanSelection(parseInt(plan.id)),
        isDisabled: plan.isCurrent, // Set disabled flag for current plan
      };
    });
  }, [subscriptionPlansQuery.data, localize]);

  // Handle plan selection
  function handlePlanSelection(planId: number) {
    console.log(`${getPlanNameById(planId)} plan selected`);

    // Find current plan and check if we need confirmation
    const currentPlan = subscriptionPlansQuery.data?.find((plan) => plan.isCurrent);
    const currentPlanId = currentPlan ? parseInt(currentPlan.id) : 0;

    if (currentPlanId > 1) {
      // Show confirmation dialog for existing subscribers
      setConfirmationPlan(planId);
      setShowConfirmation(true);
    } else {
      // New subscriber or free plan, proceed directly
      setProcessingId(planId);
      processNewSubscription(planId);
    }
  }

  function processNewSubscription(planId: number) {
    // Create new subscription
    createSubscription.mutate(
      { subscriptionId: planId },
      {
        onSuccess: (data) => {
          // Handle successful subscription creation
          if (data) {
            // Close modal before redirecting
            onOpenChange(false);
            // Redirect to payment URL
            window.location.href = data.trim();
          } else {
            console.error('No payment URL received from the server');
          }
        },
        onSettled: () => {
          setProcessingId(null);
          setShowConfirmation(false);
        },
      },
    );
  }

  function processPlanChange(planId: number) {
    // Change existing subscription
    changeSubscription.mutate(
      { subscriptionId: planId },
      {
        onSettled: () => {
          setProcessingId(null);
          subscriptionPlansQuery.refetch();
        },
      },
    );
  }

  function confirmPlanChange() {
    if (confirmationPlan !== null) {
      setProcessingId(confirmationPlan);
      setShowConfirmation(false);
      processPlanChange(confirmationPlan);
    }
  }

  function cancelPlanChange() {
    setShowConfirmation(false);
    setConfirmationPlan(null);
  }

  // Get plan name by ID for logging
  function getPlanNameById(id: number): string {
    const plan = subscriptionPlansQuery.data?.find((p) => parseInt(p.id) === id);
    return plan?.name || `Plan ${id}`;
  }

  return (
    <>
      <OGDialog open={open} onOpenChange={onOpenChange}>
        <OGDialogContent className="max-h-[85vh] w-11/12 max-w-5xl overflow-auto">
          <OGDialogHeader>
            <OGDialogTitle className="text-2xl font-bold">
              {localize('com_subscription_plans')}
            </OGDialogTitle>
          </OGDialogHeader>

          <div className="space-y-8">
            {/* Subscription Plans */}
            <div>
              {subscriptionPlans.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-lg text-text-secondary">{localize('com_ui_processing')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
                  {subscriptionPlans.map((plan) => (
                    <div
                      key={plan.id}
                      className={`relative flex flex-col rounded-xl border p-4 shadow-sm transition-all duration-200 hover:shadow-md ${
                        plan.recommended
                          ? 'border-primary bg-primary/5 dark:border-primary/70'
                          : 'border-border-medium bg-surface-primary'
                      }`}
                    >
                      {plan.recommended && (
                        <div className="absolute -top-3 right-4 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white dark:text-black">
                          {localize('com_subscription_recommended')}
                        </div>
                      )}
                      <h3 className="text-lg font-semibold">{plan.name}</h3>
                      <div className="mt-2 text-xl font-bold">{plan.price}</div>
                      <ul className="mt-3 flex-1 space-y-2 text-sm">
                        {plan.features.map((feature, index) => (
                          <li key={index} className="flex items-start">
                            <CheckIcon className="mr-2 mt-1 h-4 w-4 text-green-500" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                      <Button
                        className={`mt-4 w-full ${
                          plan.recommended
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90 dark:text-black'
                            : 'bg-[#2f7ff7] text-primary-foreground hover:bg-[#2f7ff7]/90'
                        }`}
                        onClick={plan.onClick}
                        disabled={processingId !== null || plan.isDisabled}
                        size="sm"
                      >
                        {processingId === plan.id ? (
                          <div className="flex items-center justify-center">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {localize('com_ui_processing')}
                          </div>
                        ) : (
                          plan.buttonText
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 text-sm text-text-secondary">
                {localize('com_subscription_credits_rolling_note')}
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-3 border-t border-border-medium pt-4 text-sm text-text-secondary">
            <p>{localize('com_subscription_omnexa_credit_note')}</p>
            <p>{localize('com_subscription_web_search_credit_note')}</p>
            <p>{localize('com_subscription_terms')}</p>
          </div>
        </OGDialogContent>
      </OGDialog>

      {/* Confirmation Dialog */}
      <OGDialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <OGDialogContent className="max-w-md">
          <OGDialogHeader>
            <OGDialogTitle>{localize('com_subscription_confirm_change')}</OGDialogTitle>
          </OGDialogHeader>
          <div className="py-4">
            <p>{localize('com_subscription_confirm_change_message')}</p>
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={cancelPlanChange}>
              {localize('com_ui_cancel')}
            </Button>
            <Button onClick={confirmPlanChange} disabled={processingId !== null}>
              {processingId !== null ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {localize('com_ui_confirm')}
            </Button>
          </div>
        </OGDialogContent>
      </OGDialog>
    </>
  );
};

export default SubscriptionModal;
