export * from './schemaMethods';

/**
 * Checks if the given value is truthy by being either the boolean `true` or a string
 * that case-insensitively matches 'true'.
 *
 * @function
 * @param {string|boolean|null|undefined} value - The value to check.
 * @returns {boolean} Returns `true` if the value is the boolean `true` or a case-insensitive
 *                    match for the string 'true', otherwise returns `false`.
 * @example
 *
 * isEnabled("True");  // returns true
 * isEnabled("TRUE");  // returns true
 * isEnabled(true);    // returns true
 * isEnabled("false"); // returns false
 * isEnabled(false);   // returns false
 * isEnabled(null);    // returns false
 * isEnabled();        // returns false
 */
export function isEnabled(value: boolean | string) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.toLowerCase().trim() === 'true';
  }
  return false;
}

export function checkEmailConfig() {
  return (
    (!!process.env.EMAIL_SERVICE || !!process.env.EMAIL_HOST) &&
    !!process.env.EMAIL_USERNAME &&
    !!process.env.EMAIL_PASSWORD &&
    !!process.env.EMAIL_FROM
  );
}
