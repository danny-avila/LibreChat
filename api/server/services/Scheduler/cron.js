/**
 * Dependency-free, timezone-aware "next run" computation for standard 5-field
 * cron expressions: `minute hour day-of-month month day-of-week`.
 *
 * Supports `*`, lists (`1,15`), ranges (`1-5`), and steps (`*\/2`, `0-30/10`)
 * on every field. Day-of-week is 0-6 (0 = Sunday); 7 is also accepted as
 * Sunday. When BOTH day-of-month and day-of-week are restricted, a candidate
 * matches if EITHER matches (standard cron semantics).
 *
 * Candidates are evaluated against wall-clock fields in the target IANA
 * timezone (via Intl), so DST transitions are handled by the platform.
 */

const FIELD_BOUNDS = [
  { min: 0, max: 59 }, // minute
  { min: 0, max: 23 }, // hour
  { min: 1, max: 31 }, // day of month
  { min: 1, max: 12 }, // month
  { min: 0, max: 7 }, // day of week (0 or 7 = Sunday)
];

/** Parses one cron field into a Set of allowed integers. */
function parseField(field, index) {
  const { min, max } = FIELD_BOUNDS[index];
  const allowed = new Set();
  for (const part of field.split(',')) {
    const [rangePart, stepPart] = part.split('/');
    const step = stepPart ? parseInt(stepPart, 10) : 1;
    if (!Number.isInteger(step) || step < 1) {
      throw new Error(`Invalid cron step in "${field}"`);
    }
    let start = min;
    let end = max;
    if (rangePart !== '*' && rangePart !== '') {
      const [lo, hi] = rangePart.split('-');
      start = parseInt(lo, 10);
      end = hi !== undefined ? parseInt(hi, 10) : start;
      if (!Number.isInteger(start) || !Number.isInteger(end)) {
        throw new Error(`Invalid cron range in "${field}"`);
      }
    }
    for (let v = start; v <= end; v += step) {
      allowed.add(index === 4 && v === 7 ? 0 : v);
    }
  }
  return allowed;
}

function parseCron(expression) {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Cron expression must have 5 fields, got ${fields.length}: "${expression}"`);
  }
  return {
    minute: parseField(fields[0], 0),
    hour: parseField(fields[1], 1),
    dayOfMonth: parseField(fields[2], 2),
    month: parseField(fields[3], 3),
    dayOfWeek: parseField(fields[4], 4),
    domRestricted: fields[2] !== '*',
    dowRestricted: fields[4] !== '*',
  };
}

/** Extracts wall-clock fields for `date` as observed in `timezone`. */
function getZonedParts(date, timezone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
  });
  const parts = {};
  for (const { type, value } of formatter.formatToParts(date)) {
    parts[type] = value;
  }
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
    hour: parseInt(parts.hour === '24' ? '0' : parts.hour, 10),
    minute: parseInt(parts.minute, 10),
    dayOfWeek: weekdayMap[parts.weekday],
  };
}

function matches(parsed, p) {
  if (!parsed.minute.has(p.minute)) return false;
  if (!parsed.hour.has(p.hour)) return false;
  if (!parsed.month.has(p.month)) return false;
  const domOk = parsed.dayOfMonth.has(p.day);
  const dowOk = parsed.dayOfWeek.has(p.dayOfWeek);
  if (parsed.domRestricted && parsed.dowRestricted) {
    return domOk || dowOk;
  }
  if (parsed.domRestricted) return domOk;
  if (parsed.dowRestricted) return dowOk;
  return true;
}

const ONE_MINUTE_MS = 60_000;
const MAX_LOOKAHEAD_MINUTES = 366 * 24 * 60;

/**
 * Returns the next Date strictly after `from` that satisfies the cron
 * expression in the given timezone, or `null` if none within ~1 year.
 *
 * @param {string} expression - 5-field cron expression.
 * @param {Date} from - Lower bound (exclusive).
 * @param {string} [timezone='UTC'] - IANA timezone for interpretation.
 * @returns {Date | null}
 */
function getNextCronRun(expression, from, timezone = 'UTC') {
  const parsed = parseCron(expression);
  const start = new Date(Math.floor(from.getTime() / ONE_MINUTE_MS) * ONE_MINUTE_MS + ONE_MINUTE_MS);
  for (let i = 0; i < MAX_LOOKAHEAD_MINUTES; i++) {
    const candidate = new Date(start.getTime() + i * ONE_MINUTE_MS);
    if (matches(parsed, getZonedParts(candidate, timezone))) {
      return candidate;
    }
  }
  return null;
}

/** Validates a cron expression, throwing on malformed input. */
function assertValidCron(expression) {
  parseCron(expression);
}

module.exports = { getNextCronRun, assertValidCron };
