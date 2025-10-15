import 'dotenv/config';
import crypto from 'node:crypto';
const { webcrypto } = crypto;

// Use hex decoding for both key and IV for legacy methods.
const key = Buffer.from(process.env.CREDS_KEY ?? '', 'hex');
const iv = Buffer.from(process.env.CREDS_IV ?? '', 'hex');
const algorithm = 'AES-CBC';

// --- Legacy v1/v2 Setup: AES-CBC with fixed key and IV ---

export async function encrypt(value: string) {
  const cryptoKey = await webcrypto.subtle.importKey('raw', key, { name: algorithm }, false, [
    'encrypt',
  ]);
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const encryptedBuffer = await webcrypto.subtle.encrypt(
    { name: algorithm, iv: iv },
    cryptoKey,
    data,
  );
  return Buffer.from(encryptedBuffer).toString('hex');
}

export async function decrypt(encryptedValue: string) {
  const cryptoKey = await webcrypto.subtle.importKey('raw', key, { name: algorithm }, false, [
    'decrypt',
  ]);
  const encryptedBuffer = Buffer.from(encryptedValue, 'hex');
  const decryptedBuffer = await webcrypto.subtle.decrypt(
    { name: algorithm, iv: iv },
    cryptoKey,
    encryptedBuffer,
  );
  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

// --- v2: AES-CBC with a random IV per encryption ---

export async function encryptV2(value: string) {
  const gen_iv = webcrypto.getRandomValues(new Uint8Array(16));
  const cryptoKey = await webcrypto.subtle.importKey('raw', key, { name: algorithm }, false, [
    'encrypt',
  ]);
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const encryptedBuffer = await webcrypto.subtle.encrypt(
    { name: algorithm, iv: gen_iv },
    cryptoKey,
    data,
  );
  return Buffer.from(gen_iv).toString('hex') + ':' + Buffer.from(encryptedBuffer).toString('hex');
}

export async function decryptV2(encryptedValue: string) {
  const parts = encryptedValue.split(':');
  if (parts.length === 1) {
    return parts[0];
  }
  const gen_iv = Buffer.from(parts.shift() ?? '', 'hex');
  const encrypted = parts.join(':');
  const cryptoKey = await webcrypto.subtle.importKey('raw', key, { name: algorithm }, false, [
    'decrypt',
  ]);
  const encryptedBuffer = Buffer.from(encrypted, 'hex');
  const decryptedBuffer = await webcrypto.subtle.decrypt(
    { name: algorithm, iv: gen_iv },
    cryptoKey,
    encryptedBuffer,
  );
  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

// --- v3: AES-256-CTR using Node's crypto functions ---
const algorithm_v3 = 'aes-256-ctr';

/**
 * Encrypts a value using AES-256-CTR.
 * Note: AES-256 requires a 32-byte key. Ensure that process.env.CREDS_KEY is a 64-character hex string.
 *
 * @param value - The plaintext to encrypt.
 * @returns The encrypted string with a "v3:" prefix.
 */
export function encryptV3(value: string) {
  if (key.length !== 32) {
    throw new Error(`Invalid key length: expected 32 bytes, got ${key.length} bytes`);
  }
  const iv_v3 = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm_v3, key, iv_v3);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v3:${iv_v3.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptV3(encryptedValue: string) {
  const parts = encryptedValue.split(':');
  if (parts[0] !== 'v3') {
    throw new Error('Not a v3 encrypted value');
  }
  const iv_v3 = Buffer.from(parts[1], 'hex');
  const encryptedText = Buffer.from(parts.slice(2).join(':'), 'hex');
  const decipher = crypto.createDecipheriv(algorithm_v3, key, iv_v3);
  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  return decrypted.toString('utf8');
}

export async function getRandomValues(length: number) {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('Length must be a positive integer');
  }
  const randomValues = new Uint8Array(length);
  webcrypto.getRandomValues(randomValues);
  return Buffer.from(randomValues).toString('hex');
}

/**
 * Computes SHA-256 hash for the given input.
 * @param input - The input to hash.
 * @returns The SHA-256 hash of the input.
 */
export async function hashBackupCode(input: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await webcrypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
