import { addDays } from "./addDays.mjs";
import { differenceInCalendarDays } from "./differenceInCalendarDays.mjs";
import { isSameDay } from "./isSameDay.mjs";
import { isValid } from "./isValid.mjs";
import { isWeekend } from "./isWeekend.mjs";
import { toDate } from "./toDate.mjs";

/**
 * @name differenceInBusinessDays
 * @category Day Helpers
 * @summary Get the number of business days between the given dates.
 *
 * @description
 * Get the number of business day periods between the given dates.
 * Business days being days that arent in the weekend.
 * Like `differenceInCalendarDays`, the function removes the times from
 * the dates before calculating the difference.
 *
 * @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
 *
 * @param dateLeft - The later date
 * @param dateRight - The earlier date
 *
 * @returns The number of business days
 *
 * @example
 * // How many business days are between
 * // 10 January 2014 and 20 July 2014?
 * const result = differenceInBusinessDays(
 *   new Date(2014, 6, 20),
 *   new Date(2014, 0, 10)
 * )
 * //=> 136
 *
 * // How many business days are between
 * // 30 November 2021 and 1 November 2021?
 * const result = differenceInBusinessDays(
 *   new Date(2021, 10, 30),
 *   new Date(2021, 10, 1)
 * )
 * //=> 21
 *
 * // How many business days are between
 * // 1 November 2021 and 1 December 2021?
 * const result = differenceInBusinessDays(
 *   new Date(2021, 10, 1),
 *   new Date(2021, 11, 1)
 * )
 * //=> -22
 *
 * // How many business days are between
 * // 1 November 2021 and 1 November 2021 ?
 * const result = differenceInBusinessDays(
 *   new Date(2021, 10, 1),
 *   new Date(2021, 10, 1)
 * )
 * //=> 0
 */
export function differenceInBusinessDays(dateLeft, dateRight) {
  const _dateLeft = toDate(dateLeft);
  let _dateRight = toDate(dateRight);

  if (!isValid(_dateLeft) || !isValid(_dateRight)) return NaN;

  const calendarDifference = differenceInCalendarDays(_dateLeft, _dateRight);
  const sign = calendarDifference < 0 ? -1 : 1;

  const weeks = Math.trunc(calendarDifference / 7);

  let result = weeks * 5;
  _dateRight = addDays(_dateRight, weeks * 7);

  // the loop below will run at most 6 times to account for the remaining days that don't makeup a full week
  while (!isSameDay(_dateLeft, _dateRight)) {
    // sign is used to account for both negative and positive differences
    result += isWeekend(_dateRight) ? 0 : sign;
    _dateRight = addDays(_dateRight, sign);
  }

  // Prevent negative zero
  return result === 0 ? 0 : result;
}

// Fallback for modularized imports:
export default differenceInBusinessDays;
