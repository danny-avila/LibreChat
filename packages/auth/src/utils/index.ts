export * from './avatar';
import { webcrypto } from 'node:crypto';
import bcrypt from 'bcryptjs';
/**
 * Creates Token and corresponding Hash for verification
 * @returns {[string, string]}
 */
const createTokenHash = (): [string, string] => {
  const token: string = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('hex');
  const hash: string = bcrypt.hashSync(token, 10);
  return [token, hash];
};

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
function isEnabled(value: boolean | string) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.toLowerCase().trim() === 'true';
  }
  return false;
}

function checkEmailConfig() {
  return (
    (!!process.env.EMAIL_SERVICE || !!process.env.EMAIL_HOST) &&
    !!process.env.EMAIL_USERNAME &&
    !!process.env.EMAIL_PASSWORD &&
    !!process.env.EMAIL_FROM
  );
}

export { checkEmailConfig, isEnabled, createTokenHash };
// export this helper so we can mock them
export { sendEmail, sendVerificationEmail, verifyEmail, resendVerificationEmail } from './email';
export { resizeAvatar, resizeAndConvert, getAvatarProcessFunction } from './avatar';
export { requestPasswordReset, resetPassword } from './password';
