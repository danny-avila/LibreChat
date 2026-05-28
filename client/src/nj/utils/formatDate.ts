/**
 * Simple date formatting that shows month/day + year (if it's not the current year)
 */
export function formatDate(date?: string | Date): string {
  if (!date) return '';

  const actualDate = new Date(date);
  const dateOptions: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' };
  if (actualDate.getFullYear() !== new Date().getFullYear()) {
    dateOptions.year = 'numeric';
  }

  return actualDate.toLocaleDateString('en-US', dateOptions);
}
