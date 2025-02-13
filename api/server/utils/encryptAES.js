/**
 * Encrypts a plaintext string with AES-GCM using a 256-bit key from `keyHex`.
 *
 * @param {string} plaintext - The raw text to encrypt.
 * @param {string} keyHex - A 64-character hex string representing a 256-bit key.
 * @returns {Promise<string>} A base64 string of the form "ivBase64:cipherBase64".
 * @throws {Error} If encryption fails.
 */
async function encryptLocallyAESGCM(plaintext, keyHex) {
  try {
    // 1. Convert the hex key into an ArrayBuffer.
    const keyBuffer = hexToArrayBuffer(keyHex);

    // 2. Import the key for AES-GCM.
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'AES-GCM' },
      false, // non-extractable.
      ['encrypt'],
    );

    // 3. Encode plaintext to bytes.
    const encoder = new TextEncoder();
    const plaintextBytes = encoder.encode(plaintext);

    // 4. Generate a random 12-byte IV.
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // 5. Encrypt using AES-GCM.
    const cipherBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      plaintextBytes,
    );

    // 6. Convert IV and ciphertext to base64.
    const ivBase64 = arrayBufferToBase64(iv);
    const cipherBase64 = arrayBufferToBase64(cipherBuffer);

    // 7. Return them as a single string: "ivBase64:cipherBase64".
    return ivBase64 + ':' + cipherBase64;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data.');
  }
}

/**
 * Decrypts an AES-GCM ciphertext produced by `encryptLocallyAESGCM`.
 *
 * @param {string} cipherString - The string from encryption in the format "ivBase64:cipherBase64".
 * @param {string} keyHex - The same 64-character hex key used for encryption.
 * @returns {Promise<string>} The original plaintext string.
 * @throws {Error} If decryption fails.
 */
async function decryptLocallyAESGCM(cipherString, keyHex) {
  try {
    // 1. Split into ivBase64 and cipherBase64.
    const parts = cipherString.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid cipher string format. Expected "ivBase64:cipherBase64".');
    }
    const [ivBase64, cipherBase64] = parts;

    // 2. Convert hex key to ArrayBuffer.
    const keyBuffer = hexToArrayBuffer(keyHex);

    // 3. Import the key.
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );

    // 4. Convert base64 strings to ArrayBuffers.
    const iv = new Uint8Array(base64ToArrayBuffer(ivBase64));
    const cipherBytes = base64ToArrayBuffer(cipherBase64);

    // 5. Decrypt.
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      cipherBytes,
    );

    // 6. Convert decrypted bytes back to a string.
    const decoder = new TextDecoder();
    return decoder.decode(plainBuffer);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data.');
  }
}

/**
 * Converts a base64 string to an ArrayBuffer.
 *
 * @param {string} base64 - The base64 string.
 * @returns {ArrayBuffer} The resulting ArrayBuffer.
 */
function base64ToArrayBuffer(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Converts an ArrayBuffer to a base64 string.
 *
 * @param {ArrayBuffer} buffer - The ArrayBuffer to convert.
 * @returns {string} The base64-encoded string.
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Converts a hex string to an ArrayBuffer.
 *
 * @param {string} hexString - The hex string.
 * @returns {ArrayBuffer} The resulting ArrayBuffer.
 * @throws {Error} If the hex string length is not even.
 */
function hexToArrayBuffer(hexString) {
  if (hexString.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }
  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < hexString.length; i += 2) {
    bytes[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

module.exports = {
  encryptLocallyAESGCM,
  decryptLocallyAESGCM,
  base64ToArrayBuffer,
  arrayBufferToBase64,
  hexToArrayBuffer,
};