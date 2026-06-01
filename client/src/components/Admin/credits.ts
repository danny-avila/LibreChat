/** Native credit unit: 1 USD = 1_000_000 tokenCredits. Single source for credit↔USD conversion. */
export const CREDITS_PER_USD = 1_000_000;

/** Formats a tokenCredits amount as a "$X.XX" currency string. */
export function formatUSD(valueInCredits: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueInCredits / CREDITS_PER_USD);
}

/** tokenCredits → plain USD string for input fields, e.g. 10_000_000 → "10.00". */
export function creditsToUsdInput(valueInCredits: number): string {
  return (valueInCredits / CREDITS_PER_USD).toFixed(2);
}

/** USD amount → tokenCredits (rounded to avoid floating-point drift). */
export function usdToCredits(usd: number): number {
  return Math.round(usd * CREDITS_PER_USD);
}
