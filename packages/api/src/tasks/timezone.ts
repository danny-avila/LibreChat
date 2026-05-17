/**
 * Returns true when the given string is a valid IANA timezone identifier
 * (e.g. "America/New_York", "Asia/Kolkata", "UTC"). Uses the runtime's ICU
 * data through `Intl.DateTimeFormat`; no extra dependency required.
 */
export function isValidTimezone(tz: string | undefined | null): tz is string {
  if (!tz || typeof tz !== 'string') {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves a one-shot `date` trigger expression to an absolute epoch
 * millisecond timestamp, interpreting the expression in `timezone` when the
 * expression itself has no timezone designator.
 *
 * Accepts:
 *  - Full ISO strings with offset, e.g. `2026-05-18T14:00:00-04:00`
 *  - Full ISO strings with `Z` (UTC)
 *  - Local datetime strings, e.g. `2026-05-18T14:00:00` or `2026-05-18 14:00`
 *    (in which case `timezone` is applied; UTC if omitted)
 */
export function resolveDateTriggerMillis(expression: string, timezone?: string): number {
  const hasOffset = /([zZ]|[+-]\d{2}:?\d{2})$/.test(expression.trim());
  if (hasOffset) {
    const ts = Date.parse(expression);
    if (Number.isNaN(ts)) {
      throw new Error(`Invalid date expression: ${expression}`);
    }
    return ts;
  }

  const tz = timezone && isValidTimezone(timezone) ? timezone : 'UTC';
  const naive = parseNaiveDateTime(expression);
  return zonedDateTimeToEpoch(naive, tz);
}

interface NaiveDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function parseNaiveDateTime(input: string): NaiveDateTime {
  const match = input
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    throw new Error(`Invalid date expression (expected YYYY-MM-DDTHH:mm[:ss]): ${input}`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: match[6] ? Number(match[6]) : 0,
  };
}

/**
 * Converts a wall-clock date/time in the given IANA zone to an epoch ms value.
 * Uses the two-pass `Intl.DateTimeFormat` offset trick (no external deps).
 */
function zonedDateTimeToEpoch(dt: NaiveDateTime, timeZone: string): number {
  const guessUtcMs = Date.UTC(dt.year, dt.month - 1, dt.day, dt.hour, dt.minute, dt.second);
  const offset = getZoneOffsetMs(guessUtcMs, timeZone);
  const firstPass = guessUtcMs - offset;
  const refinedOffset = getZoneOffsetMs(firstPass, timeZone);
  return guessUtcMs - refinedOffset;
}

function getZoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));

  const lookup: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') {
      lookup[p.type] = p.value;
    }
  }

  const asUtc = Date.UTC(
    Number(lookup.year),
    Number(lookup.month) - 1,
    Number(lookup.day),
    Number(lookup.hour) % 24,
    Number(lookup.minute),
    Number(lookup.second),
  );
  return asUtc - utcMs;
}
