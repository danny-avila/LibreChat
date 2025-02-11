const { sign } = require('jsonwebtoken');
const { webcrypto } = require('node:crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encodes a Buffer into a Base32 string using RFC 4648 alphabet.
 * @param {Buffer} buffer - The buffer to encode.
 * @returns {string} - The Base32 encoded string.
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
 * Generate a temporary token for 2FA verification.
 * This token is signed with JWT_SECRET and expires in 5 minutes.
 */
const generate2FATempToken = (userId) =>
  sign({ userId, twoFAPending: true }, process.env.JWT_SECRET, { expiresIn: '5m' });

/**
 * Generate a TOTP secret.
 * Generates 10 random bytes using WebCrypto and encodes them into a Base32 string.
 */
const generateTOTPSecret = () => {
  const randomArray = new Uint8Array(10);
  webcrypto.getRandomValues(randomArray);
  return encodeBase32(Buffer.from(randomArray));
};

/**
 * Generate a TOTP code based on the secret and current time.
 * Uses a 30-second time step and generates a 6-digit code.
 *
 * @param {string} secret - Base32-encoded secret
 * @param {number} [forTime=Date.now()] - Time in milliseconds
 * @returns {Promise<string>} - The 6-digit TOTP code.
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

  const offset = hmac[hmac.length - 1] & 0xf;
  const slice = hmac.slice(offset, offset + 4);
  const view = new DataView(slice.buffer, slice.byteOffset, slice.byteLength);
  const binaryCode = view.getUint32(0, false) & 0x7fffffff;
  const code = (binaryCode % 1000000).toString().padStart(6, '0');
  return code;
};

/**
 * Verify a provided TOTP token against the secret.
 * Allows for a ±1 time-step window.
 *
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
 * Generate backup codes.
 * Generates `count` backup code objects and returns an object with both plain codes
 * (for one-time download) and their objects (for secure storage). Uses WebCrypto for randomness and hashing.
 *
 * @param {number} count - Number of backup codes to generate (default: 10).
 * @returns {Promise<Object>} - Contains `plainCodes` (array of strings) and `codeObjects` (array of objects).
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

module.exports = {
  generateTOTPSecret,
  generateTOTP,
  verifyTOTP,
  generateBackupCodes,
  generate2FATempToken,
};
