import { compareAsc } from "./compareAsc.mjs";
import { differenceInCalendarISOWeekYears } from "./differenceInCalendarISOWeekYears.mjs";
import { subISOWeekYears } from "./subISOWeekYears.mjs";
import { toDate } from "./toDate.mjs";

/**
 * @name differenceInISOWeekYears
 * @category ISO Week-Numbering Year Helpers
 * @summary Get the number of full ISO week-numbering years between the given dates.
 *
 * @description
 * Get the number of full ISO week-numbering years between the given dates.
 *
 * ISO week-numbering year: http://en.wikipedia.org/wiki/ISO_week_date
 *
 * @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
 *
 * @param dateLeft - The later date
 * @param dateRight - The earlier date
 *
 * @returns The number of full ISO week-numbering years
 *
 * @example
 * // How many full ISO week-numbering years are between 1 January 2010 and 1 January 2012?
 * const result = differenceInISOWeekYears(
 *   new Date(2012, 0, 1),
 *   new Date(2010, 0, 1)
 * )
 * //=> 1
 */
export function differenceInISOWeekYears(dateLeft, dateRight) {
  let _dateLeft = toDate(dateLeft);
  const _dateRight = toDate(dateRight);

  const sign = compareAsc(_dateLeft, _dateRight);
  const difference = Math.abs(
    differenceInCalendarISOWeekYears(_dateLeft, _dateRight),
  );
  _dateLeft = subISOWeekYears(_dateLeft, sign * difference);

  // Math.abs(diff in full ISO years - diff in calendar ISO years) === 1
  // if last calendar ISO year is not full
  // If so, result must be decreased by 1 in absolute value
  const isLastISOWeekYearNotFull = Number(
    compareAsc(_dateLeft, _dateRight) === -sign,
  );
  const result = sign * (difference - isLastISOWeekYearNotFull);
  // Prevent negative zero
  return result === 0 ? 0 : result;
}

// Fallback for modularized imports:
export default differenceInISOWeekYears;
