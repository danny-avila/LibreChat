import { getRefillEligibilityDate } from 'librechat-data-provider';
import type { TBalanceResponse } from 'librechat-data-provider';
import { useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';

function useBalance(): Partial<TBalanceResponse> {
  const { isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();

  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && !!startupConfig?.balance?.enabled,
  });

  return balanceQuery.data ?? {};
}

/** Plan name from the LibreChat role the OpenID role sync assigned ("law-pro" -> "Pro"). */
export function tierName(role?: string): string {
  const name = (role ?? '').replace(/^law-/, '').toLowerCase();
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : '';
}

/** Credits left, the share of the monthly allowance, and about how many questions that buys. */
export function useUsage() {
  const { user } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const balance = useBalance();
  const left = Math.max(0, balance.tokenCredits ?? 0);
  const allowance = balance.autoRefillEnabled === true ? balance.refillAmount : undefined;
  const perQuestion = startupConfig?.balance?.creditsPerQuestion;
  const nextRefill =
    balance.autoRefillEnabled === true &&
    balance.lastRefill != null &&
    balance.refillIntervalValue != null &&
    balance.refillIntervalUnit != null
      ? getRefillEligibilityDate(
          new Date(balance.lastRefill),
          balance.refillIntervalValue,
          balance.refillIntervalUnit,
        )
      : null;
  return {
    loaded: balance.tokenCredits != null,
    tier: tierName(user?.role),
    left,
    allowance,
    share: allowance ? Math.min(1, left / allowance) : null,
    questions: perQuestion ? Math.floor(left / perQuestion) : null,
    nextRefill,
  };
}

export function Usage() {
  const localize = useLocalize();
  const usage = useUsage();
  const format = new Intl.NumberFormat(undefined, { notation: 'compact' });

  if (!usage.loaded) {
    return <div className="text-sm text-text-secondary">{localize('com_ui_loading')}</div>;
  }

  const percent = usage.share != null ? Math.round(usage.share * 100) : null;
  return (
    <div className="flex flex-col gap-4 text-sm">
      {usage.tier !== '' && (
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">{localize('com_ui_usage_plan')}</span>
          <span className="font-medium text-text-primary">{usage.tier}</span>
        </div>
      )}
      {percent != null && (
        <div
          role="progressbar"
          aria-label={localize('com_ui_usage_left')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-2 w-full overflow-hidden rounded-full bg-surface-tertiary"
        >
          <div className="h-full rounded-full bg-surface-submit" style={{ width: `${percent}%` }} />
        </div>
      )}
      {usage.questions != null && (
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">{localize('com_ui_usage_questions')}</span>
          <span className="text-base font-semibold text-text-primary" role="note">
            ≈ {usage.questions}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-text-secondary">{localize('com_ui_usage_left')}</span>
        <span className="font-medium text-text-primary">
          {format.format(usage.left)}
          {usage.allowance != null &&
            ` ${localize('com_ui_usage_of')} ${format.format(usage.allowance)} (${percent} %)`}
        </span>
      </div>
      {usage.nextRefill != null && (
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">{localize('com_ui_usage_next_refill')}</span>
          <span className="font-medium text-text-primary">
            {usage.nextRefill.toLocaleDateString()}
          </span>
        </div>
      )}
      <p className="text-xs text-text-secondary">{localize('com_ui_usage_info')}</p>
    </div>
  );
}
