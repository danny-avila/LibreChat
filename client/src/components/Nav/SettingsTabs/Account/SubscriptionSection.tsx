/* eslint-disable i18next/no-literal-string */
import { Button, Spinner } from '@librechat/client';
import { useSubscription } from '~/hooks/Subscription';

const formatPlanLabel = (plan: string | null, isPro: boolean) => {
  if (!isPro) {
    return 'Free';
  }

  if (!plan) {
    return 'CodeCan AI Pro';
  }

  return plan
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export default function SubscriptionSection() {
  const {
    isLoading,
    isNative,
    isPro,
    currentPlan,
    managementUrl,
    freeMessagesRemaining,
    openUpgradeFlow,
    openManageFlow,
    restorePurchases,
  } = useSubscription();

  const manageDisabled = !isNative && !managementUrl;
  const planLabel = formatPlanLabel(currentPlan, isPro);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border-light bg-surface-primary p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold">CodeCan AI Pro</div>
          <div className="text-sm text-text-secondary">
            {isPro ? `Active plan: ${planLabel}` : 'Upgrade to unlock unlimited Pro access.'}
          </div>
        </div>
        <div
          className={`rounded-full px-2 py-1 text-xs font-medium ${
            isPro
              ? 'bg-green-500/10 text-green-700 dark:text-green-300'
              : 'bg-surface-hover text-text-secondary'
          }`}
        >
          {isPro ? 'Pro' : 'Free'}
        </div>
      </div>

      {!isPro && typeof freeMessagesRemaining === 'number' && (
        <div className="text-sm text-text-primary">
          {freeMessagesRemaining} free message{freeMessagesRemaining === 1 ? '' : 's'} remaining
          this month.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="submit"
          onClick={() => void openUpgradeFlow()}
          disabled={isLoading}
        >
          {isLoading ? <Spinner className="icon-sm" /> : 'Upgrade'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void openManageFlow()}
          disabled={manageDisabled || isLoading}
        >
          Manage subscription
        </Button>
        {isNative && (
          <Button
            type="button"
            variant="outline"
            onClick={() => void restorePurchases()}
            disabled={isLoading}
          >
            Restore purchases
          </Button>
        )}
      </div>
    </div>
  );
}
