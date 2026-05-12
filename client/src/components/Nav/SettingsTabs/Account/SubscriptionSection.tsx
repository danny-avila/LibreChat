/* eslint-disable i18next/no-literal-string */
import { useEffect } from 'react';
import { Button, Spinner } from '@librechat/client';
import { useOptionalSubscription } from '~/hooks/Subscription';

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
  const subscription = useOptionalSubscription();

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    console.debug('[SubscriptionSection] mounted', {
      hasProvider: Boolean(subscription),
    });
  }, [subscription]);

  if (!subscription) {
    return (
      <div className="relative flex flex-col gap-2 overflow-hidden rounded-2xl border border-border-light bg-surface-primary p-5 pl-6">
        <span
          aria-hidden="true"
          className="absolute left-0 top-5 h-10 w-[3px] rounded-r-sm bg-[var(--signal-amber)]"
        />
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--slate-500)]">
          Subscription
        </div>
        <div className="text-base font-semibold tracking-tight text-text-primary">
          CodeCan AI Pro
        </div>
        <div className="text-sm text-text-secondary">
          Subscription settings are temporarily unavailable. Reload the page and try again.
        </div>
      </div>
    );
  }

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
  } = subscription;

  const manageDisabled = !isNative && !managementUrl;
  const planLabel = formatPlanLabel(currentPlan, isPro);

  return (
    <div className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-border-light bg-surface-primary p-5 pl-6">
      <span
        aria-hidden="true"
        className="absolute left-0 top-5 h-10 w-[3px] rounded-r-sm bg-[var(--signal-amber)]"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--slate-500)]">
            Subscription
          </div>
          <div className="text-base font-semibold tracking-tight text-text-primary">
            CodeCan AI Pro
          </div>
          <div className="text-sm text-text-secondary">
            {isPro ? `Active plan: ${planLabel}` : 'Upgrade to unlock unlimited Pro access.'}
          </div>
        </div>
        <div
          className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${
            isPro
              ? 'bg-[var(--signal-amber)]/15 text-[var(--signal-amber)]'
              : 'bg-brand-blue-500/10 text-brand-blue-500 dark:bg-white/10 dark:text-[var(--dm-text-mute)]'
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
