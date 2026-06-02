import { useGetUserBalance } from '~/data-provider';
import { formatUSD, budgetColor } from '~/components/Admin/credits';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';

/**
 * Compact monthly-budget gauge shown next to the model selector: "42% • $4.20 / $10.00".
 * V1 informative only (no hard block). Renders nothing until authenticated data with both
 * a non-zero monthlyBudget and a defined currentMonthSpend is available.
 */
function BudgetBadge() {
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
  const { bg, text } = budgetColor(ratio);
  const spent = formatUSD(currentMonthSpend);
  const budget = formatUSD(monthlyBudget);

  return (
    <span
      title={localize('com_budget_badge_tooltip', { percent, spent, budget })}
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${bg} ${text}`}
    >
      {percent}% • {spent} / {budget}
    </span>
  );
}

export default BudgetBadge;
