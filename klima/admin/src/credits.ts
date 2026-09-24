/**
 * Balances are stored in token credits, not dollars:
 * `1,000,000 tokenCredits = $1.00` (packages/data-schemas/src/schema/balance.ts).
 * Every credit figure in this app converts through the constant below.
 */
export const CREDITS_PER_DOLLAR = 1_000_000;

export const CREDIT_CONVERSION_NOTE = '1,000,000 token credits = $1.00 USD';

const standardUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Sub-cent balances would round to `$0.00`, which reads as "empty" when it is not. */
const preciseUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

const creditCount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export const creditsToDollars = (credits: number): number => credits / CREDITS_PER_DOLLAR;

export const dollarsToCredits = (dollars: number): number =>
  Math.round(dollars * CREDITS_PER_DOLLAR);

export const formatDollars = (credits: number): string => {
  const dollars = creditsToDollars(credits);
  if (dollars !== 0 && Math.abs(dollars) < 0.01) {
    return preciseUsd.format(dollars);
  }
  return standardUsd.format(dollars);
};

export const formatCredits = (credits: number): string =>
  `${creditCount.format(Math.round(credits))} credits`;
