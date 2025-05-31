import React, { useState, useMemo, useEffect } from 'react';
import { CheckIcon, Loader2 } from 'lucide-react';
import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle, Button } from '~/components/ui';
import { useLocalize, useMediaQuery } from '~/hooks';
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
  isFree?: boolean;
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
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  useEffect(() => {
    if (!open) return;
    subscriptionPlansQuery.refetch();
  }, [open, subscriptionPlansQuery]);

  const getButtonText = (plan: any, index: number, currentPlanIndex: number): string => {
    if (plan.isCurrent) return localize('com_subscription_current_plan');
    if (index < currentPlanIndex) return localize('com_subscription_downgrade');
    return localize('com_subscription_upgrade');
  };

  const isPlanFree = (plan: any): boolean => {
    return plan.name.toLowerCase().includes('free') || parseInt(plan.id) === 1;
  };

  const createPlanObject = (
    plan: any,
    index: number,
    currentPlanIndex: number,
  ): SubscriptionPlan => {
    return {
      id: parseInt(plan.id),
      name: plan.name,
      price: plan.label,
      features: plan.features,
      buttonText: getButtonText(plan, index, currentPlanIndex),
      recommended: plan.isRecommended,
      onClick: () => handlePlanSelection(parseInt(plan.id)),
      isDisabled: plan.isCurrent,
      isFree: isPlanFree(plan),
    };
  };

  const sortPlansWithFreeLast = (plans: SubscriptionPlan[]): SubscriptionPlan[] => {
    const paidPlans = plans.filter((plan) => !plan.isFree);
    const freePlans = plans.filter((plan) => plan.isFree);
    return [...paidPlans, ...freePlans];
  };

  const transformPlansData = (): SubscriptionPlan[] => {
    if (!subscriptionPlansQuery.data?.length) return [];

    const currentPlanIndex = subscriptionPlansQuery.data.findIndex((plan) => plan.isCurrent) ?? -1;
    const transformedPlans = subscriptionPlansQuery.data.map((plan, index) =>
      createPlanObject(plan, index, currentPlanIndex),
    );

    return sortPlansWithFreeLast(transformedPlans);
  };

  const subscriptionPlans = useMemo(
    () => transformPlansData(),
    [subscriptionPlansQuery.data, localize],
  );

  const handleNewUserSubscription = (planId: number): void => {
    setProcessingId(planId);
    processNewSubscription(planId);
  };

  const handleExistingUserPlanChange = (planId: number): void => {
    setConfirmationPlan(planId);
    setShowConfirmation(true);
  };

  const handlePlanSelection = (planId: number): void => {
    console.log(`${getPlanNameById(planId)} plan selected`);

    const currentPlan = subscriptionPlansQuery.data?.find((plan) => plan.isCurrent);
    const currentPlanId = currentPlan ? parseInt(currentPlan.id) : 0;

    if (currentPlanId <= 1) {
      handleNewUserSubscription(planId);
      return;
    }

    handleExistingUserPlanChange(planId);
  };

  const processNewSubscription = (planId: number): void => {
    createSubscription.mutate(
      { subscriptionId: planId },
      {
        onSuccess: handleSubscriptionSuccess,
        onSettled: resetProcessingState,
      },
    );
  };

  const handleSubscriptionSuccess = (data: any): void => {
    if (!data) {
      console.error('No payment URL received from the server');
      return;
    }

    onOpenChange(false);
    window.location.href = data.trim();
  };

  const resetProcessingState = (): void => {
    setProcessingId(null);
    setShowConfirmation(false);
  };

  const processPlanChange = (planId: number): void => {
    changeSubscription.mutate(
      { subscriptionId: planId },
      {
        onSettled: handlePlanChangeComplete,
      },
    );
  };

  const handlePlanChangeComplete = (): void => {
    setProcessingId(null);
    subscriptionPlansQuery.refetch();
  };

  const confirmPlanChange = (): void => {
    if (confirmationPlan === null) return;

    setProcessingId(confirmationPlan);
    setShowConfirmation(false);
    processPlanChange(confirmationPlan);
  };

  const cancelPlanChange = (): void => {
    setShowConfirmation(false);
    setConfirmationPlan(null);
  };

  const getPlanNameById = (id: number): string => {
    const plan = subscriptionPlansQuery.data?.find((p) => parseInt(p.id) === id);
    return plan?.name || `Plan ${id}`;
  };

  const calculateFreeFeatureColumns = (
    features: string[],
  ): { columns: number; itemsPerColumn: number } => {
    const maxRows = 2;
    const totalFeatures = features.length;

    if (totalFeatures <= maxRows) {
      return { columns: 1, itemsPerColumn: totalFeatures };
    }

    const columns = Math.ceil(totalFeatures / maxRows);
    const itemsPerColumn = Math.ceil(totalFeatures / columns);

    return { columns, itemsPerColumn };
  };

  const renderFreeFeatures = (features: string[]): JSX.Element => {
    const { columns, itemsPerColumn } = calculateFreeFeatureColumns(features);
    const featureColumns: string[][] = [];

    for (let i = 0; i < columns; i++) {
      const start = i * itemsPerColumn;
      const end = start + itemsPerColumn;
      featureColumns.push(features.slice(start, end));
    }

    return (
      <div className={`grid grid-cols-${columns} gap-2 text-sm text-text-secondary`}>
        {featureColumns.map((columnFeatures, columnIndex) => (
          <div key={columnIndex} className="space-y-1">
            {columnFeatures.map((feature, featureIndex) => (
              <div key={featureIndex} className="flex items-start">
                <CheckIcon className="mr-1 mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                <span className="">{feature}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  const renderPlanFeatures = (features: string[]): JSX.Element => (
    <ul className="mt-3 flex-1 space-y-2 text-sm">
      {features.map((feature, index) => (
        <li key={index} className="flex items-start">
          <CheckIcon className="mr-2 mt-1 h-4 w-4 text-green-500" />
          <span>{feature}</span>
        </li>
      ))}
    </ul>
  );

  const renderPlanButton = (plan: SubscriptionPlan): JSX.Element => {
    const isProcessing = processingId === plan.id;
    const buttonSize = plan.isFree && !isSmallScreen ? 'w-70' : 'mt-4 w-full';

    return (
      <Button
        className={`${buttonSize} ${
          plan.recommended
            ? 'bg-primary text-primary-foreground hover:bg-primary/90 dark:text-black'
            : 'bg-[#2f7ff7] text-primary-foreground hover:bg-[#2f7ff7]/90'
        }`}
        style={plan.isFree && !isSmallScreen ? { width: '280px' } : {}}
        onClick={plan.onClick}
        disabled={processingId !== null || plan.isDisabled}
        size="sm"
      >
        {isProcessing ? (
          <div className="flex items-center justify-center">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {localize('com_ui_processing')}
          </div>
        ) : (
          plan.buttonText
        )}
      </Button>
    );
  };

  const renderRecommendedBadge = (): JSX.Element => (
    <div className="absolute -top-3 right-4 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white dark:text-black">
      {localize('com_subscription_recommended')}
    </div>
  );

  const getCardClasses = (plan: SubscriptionPlan): string => {
    const baseClasses =
      'relative flex flex-col rounded-xl border shadow-sm transition-all duration-200 hover:shadow-md';
    const heightClass = plan.isFree && !isSmallScreen ? 'p-3' : 'p-4';
    const spanClass = plan.isFree && !isSmallScreen ? 'col-span-full' : '';
    const borderClass = plan.recommended
      ? 'border-primary bg-primary/5 dark:border-primary/70'
      : 'border-border-medium bg-surface-primary';

    return `${baseClasses} ${heightClass} ${spanClass} ${borderClass}`;
  };

  const renderFreePlanContent = (plan: SubscriptionPlan): JSX.Element => {
    if (isSmallScreen) {
      return renderPaidPlanContent(plan);
    }

    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex-shrink-1 mr-20">
          <h3 className="text-base font-semibold">{plan.name}</h3>
          <div className="mt-1 text-lg font-bold">{plan.price}</div>
        </div>

        <div className="min-w-0 flex-1">{renderFreeFeatures(plan.features)}</div>

        <div className="flex-shrink-0">{renderPlanButton(plan)}</div>
      </div>
    );
  };

  const renderPaidPlanContent = (plan: SubscriptionPlan): JSX.Element => (
    <>
      <h3 className="text-lg font-semibold">{plan.name}</h3>
      <div className="mt-2 text-xl font-bold">{plan.price}</div>
      {plan.isFree && isSmallScreen
        ? renderPlanFeatures(plan.features)
        : renderPlanFeatures(plan.features)}
      {renderPlanButton(plan)}
    </>
  );

  const renderPlanCard = (plan: SubscriptionPlan): JSX.Element => (
    <div key={plan.id} className={getCardClasses(plan)}>
      {plan.recommended && renderRecommendedBadge()}
      {plan.isFree ? renderFreePlanContent(plan) : renderPaidPlanContent(plan)}
    </div>
  );

  const renderEmptyState = (): JSX.Element => (
    <div className="py-8 text-center">
      <p className="text-lg text-text-secondary">{localize('com_ui_processing')}</p>
    </div>
  );

  const renderPlansGrid = (): JSX.Element => {
    if (subscriptionPlans.length === 0) {
      return renderEmptyState();
    }

    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
        {subscriptionPlans.map(renderPlanCard)}
      </div>
    );
  };

  const renderFooterLinks = (): JSX.Element => (
    <div className="border-t border-border-medium pt-2 text-sm text-text-secondary">
      {localize('com_subscription_credits_rolling_note')}
      <br />
      {localize('com_subscription_omnexa_credit_note')}
      <br />
      {localize('com_subscription_web_search_credit_note')}
      <br />
      {localize('com_by_subscribing')}{' '}
      <a className="text-sm text-blue-500" href="/pages/privacy-policy">
        {localize('com_ui_privacy_policy')}
      </a>{' '}
      {localize('com_and')}{' '}
      <a className="text-sm text-blue-500" href="/pages/tos">
        {localize('com_ui_terms_of_service')}
      </a>
      <br />
    </div>
  );

  const renderConfirmationButtons = (): JSX.Element => (
    <div className="flex justify-end space-x-2">
      <Button variant="outline" onClick={cancelPlanChange}>
        {localize('com_ui_cancel')}
      </Button>
      <Button onClick={confirmPlanChange} disabled={processingId !== null}>
        {processingId !== null && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {localize('com_ui_confirm')}
      </Button>
    </div>
  );

  const renderConfirmationDialog = (): JSX.Element => (
    <OGDialog open={showConfirmation} onOpenChange={setShowConfirmation}>
      <OGDialogContent className="max-w-md">
        <OGDialogHeader>
          <OGDialogTitle>{localize('com_subscription_confirm_change')}</OGDialogTitle>
        </OGDialogHeader>
        <div className="py-4">
          <p>{localize('com_subscription_confirm_change_message')}</p>
        </div>
        {renderConfirmationButtons()}
      </OGDialogContent>
    </OGDialog>
  );

  const renderMainDialog = (): JSX.Element => (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="max-h-[85vh] w-11/12 max-w-5xl overflow-auto">
        <OGDialogHeader>
          <OGDialogTitle className="text-2xl font-bold">
            {localize('com_subscription_plans')}
          </OGDialogTitle>
        </OGDialogHeader>
        <div className="space-y-8">
          <div>{renderPlansGrid()}</div>
        </div>
        {renderFooterLinks()}
      </OGDialogContent>
    </OGDialog>
  );

  return (
    <>
      {renderMainDialog()}
      {renderConfirmationDialog()}
    </>
  );
};

export default SubscriptionModal;
