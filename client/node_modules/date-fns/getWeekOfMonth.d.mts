import type { LocalizedOptions, WeekOptions } from "./types.js";
/**
 * The {@link getWeekOfMonth} function options.
 */
export interface GetWeekOfMonthOptions
  extends LocalizedOptions<"options">,
    WeekOptions {}
/**
 * @name getWeekOfMonth
 * @category Week Helpers
 * @summary Get the week of the month of the given date.
 *
 * @description
 * Get the week of the month of the given date.
 *
 * @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
 *
 * @param date - The given date
 * @param options - An object with options.
 *
 * @returns The week of month
 *
 * @example
 * // Which week of the month is 9 November 2017?
 * const result = getWeekOfMonth(new Date(2017, 10, 9))
 * //=> 2
 */
export declare function getWeekOfMonth<DateType extends Date>(
  date: DateType | number | string,
  options?: GetWeekOfMonthOptions,
): number;
