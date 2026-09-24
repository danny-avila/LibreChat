import type { TUsageUserTotal, TUsageTotals } from 'librechat-data-provider';
import type { UsageSlice } from './types';

const monthLabels = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const plural = (count: number, noun: string): string =>
  `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`;

/** `YYYY-MM` is already a zoned calendar month; render it as UTC so it is not shifted again. */
export const monthLabel = (month: string): string => {
  const parsed = new Date(`${month}-01T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? month : monthLabels.format(parsed);
};

export const roleLabel = (role: string): string => role || 'No role on record';

export const toMonthSlices = (totals: TUsageTotals): UsageSlice[] =>
  totals.byMonth.map((entry) => ({
    key: entry.month,
    label: monthLabel(entry.month),
    secondary: plural(entry.transactions, 'transaction'),
    credits: entry.credits,
    tokens: entry.tokens,
    transactions: entry.transactions,
  }));

export const toRoleSlices = (totals: TUsageTotals): UsageSlice[] =>
  totals.byRole.map((entry) => ({
    key: entry.role || '__unassigned__',
    label: roleLabel(entry.role),
    secondary: `${plural(entry.users, 'user')} · ${plural(entry.transactions, 'transaction')}`,
    credits: entry.credits,
    tokens: entry.tokens,
    transactions: entry.transactions,
  }));

export const toModelSlices = (totals: TUsageTotals): UsageSlice[] =>
  totals.models.map((entry) => ({
    key: entry.model,
    label: entry.model,
    secondary: plural(entry.transactions, 'transaction'),
    credits: entry.credits,
    tokens: entry.tokens,
    transactions: entry.transactions,
  }));

/** A spender is named by whatever identity survived: display name, then email, then id. */
export const spenderLabel = (entry: TUsageUserTotal): string =>
  entry.name || entry.email || entry.userId;
