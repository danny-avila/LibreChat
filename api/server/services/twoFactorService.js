const { webcrypto } = require('node:crypto');
const { decryptV3, decryptV2 } = require('../utils/crypto');
const { hashBackupCode } = require('~/server/utils/crypto');

// Base32 alphabet for TOTP secret encoding.
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encodes a Buffer into a Base32 string.
 * @param {Buffer} buffer
 * @returns {string}
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
 * Decodes a Base32 string into a Buffer.
 * @param {string} base32Str
 * @returns {Buffer}
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
 * Generates a new TOTP secret (Base32 encoded).
 * @returns {string}
 */
const generateTOTPSecret = () => {
  const randomArray = new Uint8Array(10);
  webcrypto.getRandomValues(randomArray);
  return encodeBase32(Buffer.from(randomArray));
};

/**
 * Generates a TOTP code based on the secret and time.
 * Uses a 30-second time step and produces a 6-digit code.
 * @param {string} secret
 * @param {number} [forTime=Date.now()]
 * @returns {Promise<string>}
 */
const generateTOTP = async (secret, forTime = Date.now()) => {
  const timeStep = 30; // seconds
  const counter = Math.floor(forTime / 1000 / timeStep);
  const counterBuffer = new ArrayBuffer(8);
  const counterView = new DataView(counterBuffer);
  counterView.setUint32(4, counter, false);

  const keyBuffer = decodeBase32(secret);
  const keyArrayBuffer = keyBuffer.buffer.slice(
    keyBuffer.byteOffset,
    keyBuffer.byteOffset + keyBuffer.byteLength,
  );

  const cryptoKey = await webcrypto.subtle.importKey(
    'raw',
    keyArrayBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const signatureBuffer = await webcrypto.subtle.sign('HMAC', cryptoKey, counterBuffer);
  const hmac = new Uint8Array(signatureBuffer);

  // Dynamic truncation per RFC 4226.
  const offset = hmac[hmac.length - 1] & 0xf;
  const slice = hmac.slice(offset, offset + 4);
  const view = new DataView(slice.buffer, slice.byteOffset, slice.byteLength);
  const binaryCode = view.getUint32(0, false) & 0x7fffffff;
  const code = (binaryCode % 1000000).toString().padStart(6, '0');
  return code;
};

/**
 * Verifies a TOTP token by checking a ±1 time step window.
 * @param {string} secret
 * @param {string} token
 * @returns {Promise<boolean>}
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
 * Generates backup codes (default count: 10).
 * Each code is an 8-character hexadecimal string and stored with its SHA-256 hash.
 * @param {number} [count=10]
 * @returns {Promise<{ plainCodes: string[], codeObjects: Array<{ codeHash: string, used: boolean, usedAt: Date | null }> }>}
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
      .join('');
    plainCodes.push(code);

    const codeBuffer = encoder.encode(code);
    const hashBuffer = await webcrypto.subtle.digest('SHA-256', codeBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const codeHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    codeObjects.push({ codeHash, used: false, usedAt: null });
  }
  return { plainCodes, codeObjects };
};

/**
 * Verifies a backup code and, if valid, marks it as used.
 * @param {Object} params
 * @param {Object} params.user
 * @param {string} params.backupCode
 * @returns {Promise<boolean>}
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
    // Update the user record with the marked backup code.
    const { updateUser } = require('~/models');
    await updateUser(user._id, { backupCodes: updatedBackupCodes });
    return true;
  }
  return false;
};

/**
 * Retrieves and decrypts a stored TOTP secret.
 * - Uses decryptV3 if the secret has a "v3:" prefix.
 * - Falls back to decryptV2 for colon-delimited values.
 * - Assumes a 16-character secret is already plain.
 * @param {string|null} storedSecret
 * @returns {Promise<string|null>}
 */
const getTOTPSecret = async (storedSecret) => {
  if (!storedSecret) {
    return null;
  }
  if (storedSecret.startsWith('v3:')) {
    return decryptV3(storedSecret);
  }
  if (storedSecret.includes(':')) {
    return await decryptV2(storedSecret);
  }
  if (storedSecret.length === 16) {
    return storedSecret;
  }
  return storedSecret;
};

/**
 * Generates a temporary JWT token for 2FA verification that expires in 5 minutes.
 * @param {string} userId
 * @returns {string}
 */
const generate2FATempToken = (userId) => {
  const { sign } = require('jsonwebtoken');
  return sign({ userId, twoFAPending: true }, process.env.JWT_SECRET, { expiresIn: '5m' });
};

module.exports = {
  generateTOTPSecret,
  generateTOTP,
  verifyTOTP,
  generateBackupCodes,
  verifyBackupCode,
  getTOTPSecret,
  generate2FATempToken,
};
