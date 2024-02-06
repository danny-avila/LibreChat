import type { NormalizedInterval } from "./types.js";
/**
 * The {@link interval} function options.
 */
export interface IntervalOptions {
  /** Asserts that the interval is positive (start is after the end). */
  assertPositive?: boolean;
}
/**
 * @name interval
 * @category Interval Helpers
 * @summary Creates an interval object and validates its values.
 *
 * @description
 * Creates a normalized interval object and validates its values. If the interval is invalid, an exception is thrown.
 *
 * @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
 *
 * @param start - The start of the interval.
 * @param end - The end of the interval.
 * @param options - The options object.
 *
 * @throws `Start date is invalid` when `start` is invalid.
 * @throws `End date is invalid` when `end` is invalid.
 * @throws `End date must be after start date` when end is before `start` and `options.assertPositive` is true.
 *
 * @returns The normalized and validated interval object.
 */
export declare function interval<DateType extends Date>(
  start: DateType | number | string,
  end: DateType | number | string,
  options?: IntervalOptions,
): NormalizedInterval<DateType>;
