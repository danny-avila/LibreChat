import 'dotenv/config';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { SignPayloadParams } from '~/types';

const { webcrypto } = crypto;

const key = Buffer.from(process.env.CREDS_KEY ?? '', 'hex');
const iv = Buffer.from(process.env.CREDS_IV ?? '', 'hex');
const algorithm = 'AES-CBC';

export async function signPayload({
  payload,
  secret,
  expirationTime,
}: SignPayloadParams): Promise<string> {
  return jwt.sign(payload, secret!, { expiresIn: expirationTime });
}

export async function hashToken(str: string): Promise<string> {
  const data = new TextEncoder().encode(str);
  const hashBuffer = await webcrypto.subtle.digest('SHA-256', data);
  return Buffer.from(hashBuffer).toString('hex');
}

/**
 * Encrypts a value using AES-CBC
 * @param value - The plaintext to encrypt
 * @returns The encrypted string in hex format
 */
export async function encrypt(value: string): Promise<string> {
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

/**
 * Decrypts an encrypted value using AES-CBC
 * @param encryptedValue - The encrypted string in hex format
 * @returns The decrypted plaintext
 */
export async function decrypt(encryptedValue: string): Promise<string> {
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
