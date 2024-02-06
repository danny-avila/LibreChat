import { addWeeks } from "./addWeeks.mjs";
import { millisecondsInWeek } from "./constants.mjs";
import { startOfISOWeekYear } from "./startOfISOWeekYear.mjs";

/**
 * @name getISOWeeksInYear
 * @category ISO Week-Numbering Year Helpers
 * @summary Get the number of weeks in an ISO week-numbering year of the given date.
 *
 * @description
 * Get the number of weeks in an ISO week-numbering year of the given date.
 *
 * ISO week-numbering year: http://en.wikipedia.org/wiki/ISO_week_date
 *
 * @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
 *
 * @param date - The given date
 *
 * @returns The number of ISO weeks in a year
 *
 * @example
 * // How many weeks are in ISO week-numbering year 2015?
 * const result = getISOWeeksInYear(new Date(2015, 1, 11))
 * //=> 53
 */
export function getISOWeeksInYear(date) {
  const thisYear = startOfISOWeekYear(date);
  const nextYear = startOfISOWeekYear(addWeeks(thisYear, 60));
  const diff = +nextYear - +thisYear;

  // Round the number of weeks to the nearest integer because the number of
  // milliseconds in a week is not constant (e.g. it's different in the week of
  // the daylight saving time clock shift).
  return Math.round(diff / millisecondsInWeek);
}

// Fallback for modularized imports:
export default getISOWeeksInYear;
