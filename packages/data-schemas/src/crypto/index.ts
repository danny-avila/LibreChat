import jwt from 'jsonwebtoken';
import { webcrypto } from 'node:crypto';
import { SignPayloadParams } from '~/types';

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
