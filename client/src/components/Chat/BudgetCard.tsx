import { Gauge } from 'lucide-react';
import { useGetUserBalance } from '~/data-provider';
import { formatUSD, budgetColor } from '~/components/Admin/credits';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';

/**
 * Monthly-budget gauge shown under the composer (landing and conversation): title + colored
 * progress bar + spend figures. V1 informative only (no hard block). Renders nothing until
 * authenticated data with both a non-zero monthlyBudget and a defined currentMonthSpend exists.
 */
function BudgetCard() {
  const localize = useLocalize();
  const { isAuthenticated } = useAuthContext();
  const { data } = useGetUserBalance({ enabled: !!isAuthenticated });

  if (!isAuthenticated || data === undefined) {
    return null;
  }

  const { currentMonthSpend, monthlyBudget } = data;
  if (
    currentMonthSpend === undefined ||
    monthlyBudget === undefined ||
    monthlyBudget === 0
  ) {
    return null;
  }

  const ratio = Math.min(1, Math.max(0, currentMonthSpend / monthlyBudget));
  const percent = Math.round(ratio * 100);
  const { bar, text } = budgetColor(ratio);
  const spent = formatUSD(currentMonthSpend);
  const budget = formatUSD(monthlyBudget);

  return (
    <div
      title={localize('com_budget_badge_tooltip', { percent, spent, budget })}
      className="mx-auto mt-3 flex w-full max-w-3xl flex-col gap-1.5 rounded-xl border border-border-light bg-surface-secondary px-4 py-3"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <Gauge size={16} className="text-text-secondary" aria-hidden="true" />
          {localize('com_budget_card_title')}
        </span>
        <span className={`text-sm font-semibold ${text}`}>{percent}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-tertiary">
        <div className={`h-full transition-all ${bar}`} style={{ width: `${percent}%` }} />
      </div>
      <p className="text-xs text-text-secondary">
        {localize('com_budget_card_consumption', { spent, budget })}
      </p>
    </div>
  );
}

export default BudgetCard;
