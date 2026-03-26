/**
 * Returns the next midnight (in New Jersey) as an expiration date.
 *
 * We use this instead of the built-in expiration so that we can give a clear answer to users
 * about when their chats will expire.
 */
export function createNewJerseyMidnightExpirationDate(): Date {
  // Implementation note: this is needlessly difficult because we're trying not to add any
  // new libraries (and thus can't use a reasonable datetime lib).
  const now = new Date();

  // Get today's date in NJ timezone
  const todayNJ = new Date(
    now.toLocaleString('en-US', {
      timeZone: 'America/New_York',
    }),
  );

  // Get tomorrow's date in NJ timezone
  const tomorrowNJ = new Date(todayNJ);
  tomorrowNJ.setDate(tomorrowNJ.getDate() + 1);

  // Format tomorrow's date as YYYY-MM-DD in the LOCAL timezone (if we reformat to New_York, then
  // it's possible to *lose* a day depending on the system timezone). This will ultimately result
  // in a date string that is the correct date.
  const tomorrowNJStr = tomorrowNJ.toLocaleDateString('en-CA');

  // Create a date object for midnight of tomorrow in NJ
  // Parse it as if it's in NJ timezone by using a temporary date
  const tempDate = new Date(`${tomorrowNJStr}T00:00:00`);

  // Get the offset for that specific date (handles DST transitions)
  const offsetMinutes = getTimezoneOffset(tempDate, 'America/New_York');
  const offsetHours = offsetMinutes / 60;
  const offsetStr = formatOffset(offsetHours);

  // Create the final date with correct offset
  return new Date(`${tomorrowNJStr}T00:00:00${offsetStr}`);
}

function getTimezoneOffset(date: Date, timeZone: string): number {
  // Get the time in UTC
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  // Get the time in target timezone
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone }));
  // Return difference in minutes
  return (tzDate.getTime() - utcDate.getTime()) / 60000;
}

function formatOffset(hours: number): string {
  const sign = hours >= 0 ? '+' : '-';
  const absHours = Math.abs(hours);
  const h = Math.floor(absHours).toString().padStart(2, '0');
  const m = ((absHours % 1) * 60).toString().padStart(2, '0');
  return `${sign}${h}:${m}`;
}
