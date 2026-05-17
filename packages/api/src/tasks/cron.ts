/**
 * Lightweight validator for 5-field cron expressions (minute hour day-of-month
 * month day-of-week). Catches obvious typos before submission and gives the UI
 * something to display; BullMQ + cron-parser remain the source of truth at
 * schedule time.
 *
 * Each field supports:
 *  - "*"                        (every value)
 *  - a fixed number             ("5")
 *  - a range                    ("1-5")
 *  - a step expression          ("*\/15", "1-30/2", "0/5")
 *  - a comma-separated list of any of the above ("0,15,30,45")
 *
 * Named months (jan..dec) and days (sun..sat) are also accepted, mirroring the
 * format crontab.guru documents.
 */
const FIELD_TOKEN = /^(?:\*|\d+|[a-zA-Z]+)(?:-(?:\d+|[a-zA-Z]+))?(?:\/\d+)?$/;

function isValidField(field: string): boolean {
  if (field === '*') {
    return true;
  }
  return field
    .split(',')
    .every((token) => token.length > 0 && FIELD_TOKEN.test(token));
}

export function isValidCronExpression(expression: string): boolean {
  if (typeof expression !== 'string') {
    return false;
  }
  const trimmed = expression.trim();
  if (!trimmed) {
    return false;
  }
  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5) {
    return false;
  }
  return fields.every(isValidField);
}
