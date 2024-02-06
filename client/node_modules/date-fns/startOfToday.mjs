import { startOfDay } from "./startOfDay.mjs";

/**
 * @name startOfToday
 * @category Day Helpers
 * @summary Return the start of today.
 * @pure false
 *
 * @description
 * Return the start of today.
 *
 * @returns The start of today
 *
 * @example
 * // If today is 6 October 2014:
 * const result = startOfToday()
 * //=> Mon Oct 6 2014 00:00:00
 */
export function startOfToday() {
  return startOfDay(Date.now());
}

// Fallback for modularized imports:
export default startOfToday;
