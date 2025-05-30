import mongoose, { Schema } from 'mongoose';
import jwt from 'jsonwebtoken';
import { webcrypto } from 'node:crypto';
import { ISession, SignPayloadParams } from '~/types';

const sessionSchema: Schema<ISession> = new Schema({
  refreshTokenHash: {
    type: String,
    required: true,
  },
  expiration: {
    type: Date,
    required: true,
    expires: 0,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
});

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

export default sessionSchema;
