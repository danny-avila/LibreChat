const crypto = require('crypto');
const { sign } = require('jsonwebtoken');

// Standard Base32 alphabet per RFC 4648.
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encodes a Buffer into a Base32 string using RFC 4648 alphabet.
 * @param {Buffer} buffer - The buffer to encode.
 * @returns {string} - The Base32 encoded string.
 */
function encodeBase32(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
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
}

/**
 * Generate a temporary token for 2FA verification.
 * This token is signed with JWT_2FA_SECRET and expires in 5 minutes.
 */
function generate2FATempToken(userId) {
  return sign({ userId, twoFAPending: true }, process.env.JWT_2FA_SECRET, { expiresIn: '5m' });
}

/**
 * Generate a TOTP secret.
 * This function generates 10 random bytes and encodes them into a Base32 string.
 */
function generateTOTPSecret() {
  const secretBuffer = crypto.randomBytes(10); // 10 bytes for a good length secret
  return encodeBase32(secretBuffer);
}

/**
 * Generate a TOTP code based on the secret and current time.
 * Uses a 30-second time step and generates a 6-digit code.
 * Decodes the Base32 secret into a Buffer for HMAC calculation.
 */
function generateTOTP(secret, forTime = Date.now()) {
  const timeStep = 30; // seconds
  const counter = Math.floor(forTime / 1000 / timeStep);
  const counterBuffer = Buffer.alloc(8);
  // Write counter as big-endian. Write 0 for the first 4 bytes and the counter for the last 4.
  counterBuffer.writeUInt32BE(0, 0);
  counterBuffer.writeUInt32BE(counter, 4);
  // Decode the secret: our secret is already in Base32.
  // To get a Buffer, we need to reverse our Base32 encoding manually.
  // For simplicity, we re-encode the secret using our own function is not needed,
  // because generateTOTPSecret produced a Base32 string from random bytes.
  // We can decode it manually. Here’s a simple decoder (not optimized for production):

  function decodeBase32(base32Str) {
    const cleaned = base32Str.replace(/=+$/, '').toUpperCase();
    let bits = 0;
    let value = 0;
    const output = [];
    for (let i = 0; i < cleaned.length; i++) {
      const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
      if (idx === -1) {continue;}
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        output.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return Buffer.from(output);
  }

  const key = decodeBase32(secret);
  const hmac = crypto.createHmac('sha1', key);
  hmac.update(counterBuffer);
  const hmacResult = hmac.digest();
  const offset = hmacResult[hmacResult.length - 1] & 0xf;
  const codeInt = (hmacResult.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return codeInt.toString().padStart(6, '0');
}

/**
 * Verify a provided TOTP token against the secret.
 * Allows for a ±1 time-step window.
 */
function verifyTOTP(secret, token) {
  const timeStep = 30 * 1000; // in ms
  const currentTime = Date.now();
  for (let errorWindow = -1; errorWindow <= 1; errorWindow++) {
    const expected = generateTOTP(secret, currentTime + errorWindow * timeStep);
    if (expected === token) {
      return true;
    }
  }
  return false;
}

/**
 * Generate backup codes as objects.
 * Generates `count` backup code objects and returns an object with both plain codes
 * (for one-time download) and their objects (for secure storage).
 *
 * @param {number} count - Number of backup codes to generate (default: 10).
 * @returns {Object} - An object containing `plainCodes` (array of strings) and `codeObjects` (array of objects).
 */
function generateBackupCodes(count = 10) {
  const plainCodes = [];
  const codeObjects = [];
  for (let i = 0; i < count; i++) {
    // Generate an 8-character hex string backup code.
    const code = crypto.randomBytes(4).toString('hex');
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    plainCodes.push(code);
    codeObjects.push({
      codeHash,
      used: false,
      usedAt: null,
    });
  }
  return { plainCodes, codeObjects };
}

module.exports = {
  generateTOTPSecret,
  generateTOTP,
  verifyTOTP,
  generateBackupCodes,
  generate2FATempToken,
};