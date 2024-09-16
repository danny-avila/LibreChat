require('dotenv').config();

const { webcrypto } = require('node:crypto');
const key = Buffer.from(process.env.CREDS_KEY, 'hex');
const iv = Buffer.from(process.env.CREDS_IV, 'hex');
const algorithm = 'AES-CBC';

async function encrypt(value) {
  const cryptoKey = await webcrypto.subtle.importKey('raw', key, { name: algorithm }, false, [
    'encrypt',
  ]);

  const encoder = new TextEncoder();
  const data = encoder.encode(value);

  const encryptedBuffer = await webcrypto.subtle.encrypt(
    {
      name: algorithm,
      iv: iv,
    },
    cryptoKey,
    data,
  );

  return Buffer.from(encryptedBuffer).toString('hex');
}

async function decrypt(encryptedValue) {
  const cryptoKey = await webcrypto.subtle.importKey('raw', key, { name: algorithm }, false, [
    'decrypt',
  ]);

  const encryptedBuffer = Buffer.from(encryptedValue, 'hex');

  const decryptedBuffer = await webcrypto.subtle.decrypt(
    {
      name: algorithm,
      iv: iv,
    },
    cryptoKey,
    encryptedBuffer,
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

// Programmatically generate iv
async function encryptV2(value) {
  const gen_iv = webcrypto.getRandomValues(new Uint8Array(16));

  const cryptoKey = await webcrypto.subtle.importKey('raw', key, { name: algorithm }, false, [
    'encrypt',
  ]);

  const encoder = new TextEncoder();
  const data = encoder.encode(value);

  const encryptedBuffer = await webcrypto.subtle.encrypt(
    {
      name: algorithm,
      iv: gen_iv,
    },
    cryptoKey,
    data,
  );

  return Buffer.from(gen_iv).toString('hex') + ':' + Buffer.from(encryptedBuffer).toString('hex');
}

async function decryptV2(encryptedValue) {
  const parts = encryptedValue.split(':');
  // Already decrypted from an earlier invocation
  if (parts.length === 1) {
    return parts[0];
  }
  const gen_iv = Buffer.from(parts.shift(), 'hex');
  const encrypted = parts.join(':');

  const cryptoKey = await webcrypto.subtle.importKey('raw', key, { name: algorithm }, false, [
    'decrypt',
  ]);

  const encryptedBuffer = Buffer.from(encrypted, 'hex');

  const decryptedBuffer = await webcrypto.subtle.decrypt(
    {
      name: algorithm,
      iv: gen_iv,
    },
    cryptoKey,
    encryptedBuffer,
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

async function hashToken(str) {
  const data = new TextEncoder().encode(str);
  const hashBuffer = await webcrypto.subtle.digest('SHA-256', data);
  return Buffer.from(hashBuffer).toString('hex');
}

async function getRandomValues(length) {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('Length must be a positive integer');
  }

  const randomValues = new Uint8Array(length);
  webcrypto.getRandomValues(randomValues);
  return Buffer.from(randomValues).toString('hex');
}

module.exports = { encrypt, decrypt, encryptV2, decryptV2, hashToken, getRandomValues };
