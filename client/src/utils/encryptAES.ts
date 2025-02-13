/**
 * Encrypts a plaintext string with AES-GCM using a 256-bit key from `keyHex`.
 *
 * @param plaintext - The raw text to encrypt
 * @param keyHex - A 64-char hex string representing a 256-bit key
 * @returns A base64 string of the form: `${ivBase64}:${cipherBase64}`
 * @throws Error if encryption fails
 */
export async function encryptLocallyAESGCM(
  plaintext: string,
  keyHex: string
): Promise<string> {
  try {
    // 1. Convert the hex key into ArrayBuffer
    const keyBuffer = hexToArrayBuffer(keyHex);

    // 2. Import the key for AES-GCM
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'AES-GCM' },
      false, // not extractable
      ['encrypt']
    );

    // 3. Encode plaintext to bytes
    const encoder = new TextEncoder();
    const plaintextBytes = encoder.encode(plaintext);

    // 4. Generate a random 12-byte IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // 5. Encrypt using AES-GCM
    const cipherBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      plaintextBytes
    );

    // 6. Convert IV and ciphertext to base64
    const ivBase64 = arrayBufferToBase64(iv);
    const cipherBase64 = arrayBufferToBase64(cipherBuffer);

    // 7. Return them as a single string e.g. "ivBase64:cipherBase64"
    return `${ivBase64}:${cipherBase64}`;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data.');
  }
}

/**
 * Decrypts an AES-GCM ciphertext produced by `encryptLocallyAESGCM`.
 *
 * @param cipherString - The string from encryption, in form "ivBase64:cipherBase64"
 * @param keyHex - The same 64-char hex key used for encryption
 * @returns The original plaintext string
 * @throws Error if decryption fails
 */
export async function decryptLocallyAESGCM(
  cipherString: string,
  keyHex: string
): Promise<string> {
  try {
    // 1. Split into ivBase64 and cipherBase64
    const [ivBase64, cipherBase64] = cipherString.split(':');
    if (!ivBase64 || !cipherBase64) {
      throw new Error('Invalid cipher string format. Expected "ivBase64:cipherBase64".');
    }

    // 2. Convert hex key to ArrayBuffer
    const keyBuffer = hexToArrayBuffer(keyHex);

    // 3. Import the key
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    // 4. Convert base64 -> ArrayBuffer
    const iv = new Uint8Array(base64ToArrayBuffer(ivBase64));
    const cipherBytes = base64ToArrayBuffer(cipherBase64);

    // 5. Decrypt
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      cipherBytes
    );

    // 6. Convert bytes -> string
    const decoder = new TextDecoder();
    const plaintext = decoder.decode(plainBuffer);
    return plaintext;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data.');
  }
}

/**
 * Convert a base64 string to an ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert an ArrayBuffer to a base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Convert a hex string to an ArrayBuffer
 */
function hexToArrayBuffer(hexString: string): ArrayBuffer {
  if (hexString.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }
  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < hexString.length; i += 2) {
    bytes[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}