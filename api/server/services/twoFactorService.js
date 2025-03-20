const { sign } = require('jsonwebtoken');
const { webcrypto } = require('node:crypto');
const { hashBackupCode, decryptV2, decryptV3 } = require('~/server/utils/crypto');
const { updateUser } = require('~/models/userMethods');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encodes a Buffer into a Base32 string using the RFC 4648 alphabet.
 *
 * @param {Buffer} buffer - The buffer to encode.
 * @returns {string} The Base32 encoded string.
 */
const encodeBase32 = (buffer) => {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
};

/**
 * Decodes a Base32-encoded string back into a Buffer.
 *
 * @param {string} base32Str - The Base32-encoded string.
 * @returns {Buffer} The decoded buffer.
 */
const decodeBase32 = (base32Str) => {
  const cleaned = base32Str.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const output = [];
  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      continue;
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
};

/**
 * Generates a temporary token for 2FA verification.
 * The token is signed with the JWT_SECRET and expires in 5 minutes.
 *
 * @param {string} userId - The unique identifier of the user.
 * @returns {string} The signed JWT token.
 */
const generate2FATempToken = (userId) =>
  sign({ userId, twoFAPending: true }, process.env.JWT_SECRET, { expiresIn: '5m' });

/**
 * Generates a TOTP secret.
 * Creates 10 random bytes using WebCrypto and encodes them into a Base32 string.
 *
 * @returns {string} A Base32-encoded secret for TOTP.
 */
const generateTOTPSecret = () => {
  const randomArray = new Uint8Array(10);
  webcrypto.getRandomValues(randomArray);
  return encodeBase32(Buffer.from(randomArray));
};

/**
 * Generates a Time-based One-Time Password (TOTP) based on the provided secret and time.
 * This implementation uses a 30-second time step and produces a 6-digit code.
 *
 * @param {string} secret - The Base32-encoded TOTP secret.
 * @param {number} [forTime=Date.now()] - The time (in milliseconds) for which to generate the TOTP.
 * @returns {Promise<string>} A promise that resolves to the 6-digit TOTP code.
 */
const generateTOTP = async (secret, forTime = Date.now()) => {
  const timeStep = 30; // seconds
  const counter = Math.floor(forTime / 1000 / timeStep);
  const counterBuffer = new ArrayBuffer(8);
  const counterView = new DataView(counterBuffer);
  // Write counter into the last 4 bytes (big-endian)
  counterView.setUint32(4, counter, false);

  // Decode the secret into an ArrayBuffer
  const keyBuffer = decodeBase32(secret);
  const keyArrayBuffer = keyBuffer.buffer.slice(
    keyBuffer.byteOffset,
    keyBuffer.byteOffset + keyBuffer.byteLength,
  );

  // Import the key for HMAC-SHA1 signing
  const cryptoKey = await webcrypto.subtle.importKey(
    'raw',
    keyArrayBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );

  // Generate HMAC signature
  const signatureBuffer = await webcrypto.subtle.sign('HMAC', cryptoKey, counterBuffer);
  const hmac = new Uint8Array(signatureBuffer);

  // Dynamic truncation as per RFC 4226
  const offset = hmac[hmac.length - 1] & 0xf;
  const slice = hmac.slice(offset, offset + 4);
  const view = new DataView(slice.buffer, slice.byteOffset, slice.byteLength);
  const binaryCode = view.getUint32(0, false) & 0x7fffffff;
  const code = (binaryCode % 1000000).toString().padStart(6, '0');
  return code;
};

/**
 * Verifies a provided TOTP token against the secret.
 * It allows for a ±1 time-step window to account for slight clock discrepancies.
 *
 * @param {string} secret - The Base32-encoded TOTP secret.
 * @param {string} token - The TOTP token provided by the user.
 * @returns {Promise<boolean>} A promise that resolves to true if the token is valid; otherwise, false.
 */
const verifyTOTP = async (secret, token) => {
  const timeStepMS = 30 * 1000;
  const currentTime = Date.now();
  for (let offset = -1; offset <= 1; offset++) {
    const expected = await generateTOTP(secret, currentTime + offset * timeStepMS);
    if (expected === token) {
      return true;
    }
  }
  return false;
};

/**
 * Generates backup codes for two-factor authentication.
 * Each backup code is an 8-character hexadecimal string along with its SHA-256 hash.
 * The plain codes are returned for one-time download, while the hashed objects are meant for secure storage.
 *
 * @param {number} [count=10] - The number of backup codes to generate.
 * @returns {Promise<{ plainCodes: string[], codeObjects: Array<{ codeHash: string, used: boolean, usedAt: Date | null }> }>}
 *          A promise that resolves to an object containing both plain backup codes and their corresponding code objects.
 */
const generateBackupCodes = async (count = 10) => {
  const plainCodes = [];
  const codeObjects = [];
  const encoder = new TextEncoder();
  for (let i = 0; i < count; i++) {
    const randomArray = new Uint8Array(4);
    webcrypto.getRandomValues(randomArray);
    const code = Array.from(randomArray)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(''); // 8-character hex code
    plainCodes.push(code);

    // Compute SHA-256 hash of the code using WebCrypto
    const codeBuffer = encoder.encode(code);
    const hashBuffer = await webcrypto.subtle.digest('SHA-256', codeBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const codeHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    codeObjects.push({ codeHash, used: false, usedAt: null });
  }
  return { plainCodes, codeObjects };
};

/**
 * Verifies a backup code for a user and updates its status as used if valid.
 *
 * @param {Object} params - The parameters object.
 * @param {TUser | undefined} [params.user] - The user object containing backup codes.
 * @param {string | undefined} [params.backupCode] - The backup code to verify.
 * @returns {Promise<boolean>} A promise that resolves to true if the backup code is valid and updated; otherwise, false.
 */
const verifyBackupCode = async ({ user, backupCode }) => {
  if (!backupCode || !user || !Array.isArray(user.backupCodes)) {
    return false;
  }

  const hashedInput = await hashBackupCode(backupCode.trim());
  const matchingCode = user.backupCodes.find(
    (codeObj) => codeObj.codeHash === hashedInput && !codeObj.used,
  );

  if (matchingCode) {
    const updatedBackupCodes = user.backupCodes.map((codeObj) =>
      codeObj.codeHash === hashedInput && !codeObj.used
        ? { ...codeObj, used: true, usedAt: new Date() }
        : codeObj,
    );

    await updateUser(user._id, { backupCodes: updatedBackupCodes });
    return true;
  }

  return false;
};

/**
 * Retrieves and, if necessary, decrypts a stored TOTP secret.
 *
 * - If the secret starts with "v3:" then it is decrypted using decryptV3.
 * - Otherwise, if it contains a colon, it is assumed to be in the v2 format and is decrypted using decryptV2.
 * - If the secret is exactly 16 characters long, it is assumed to be a legacy plain secret.
 *
 * @param {string|null} storedSecret - The stored TOTP secret (which may be encrypted).
 * @returns {Promise<string|null>} A promise that resolves to the plain TOTP secret, or null if none is provided.
 */
const getTOTPSecret = async (storedSecret) => {
  if (!storedSecret) {
    return null;
  }
  // Check for the v3 prefix.
  if (storedSecret.startsWith('v3:')) {
    return decryptV3(storedSecret);
  }
  // Check for a colon marker (v2 encrypted secrets are stored as "iv:encryptedData")
  if (storedSecret.includes(':')) {
    return await decryptV2(storedSecret);
  }
  // If it's exactly 16 characters, assume it's already plain (legacy secret)
  if (storedSecret.length === 16) {
    return storedSecret;
  }
  // Fallback in case it doesn't meet our criteria.
  return storedSecret;
};

module.exports = {
  verifyTOTP,
  generateTOTP,
  getTOTPSecret,
  verifyBackupCode,
  generateTOTPSecret,
  generateBackupCodes,
  generate2FATempToken,
};
