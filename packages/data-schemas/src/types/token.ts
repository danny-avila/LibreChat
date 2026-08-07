import { Document, Types } from 'mongoose';

export interface IToken extends Document {
  userId: Types.ObjectId;
  email?: string;
  type?: string;
  identifier?: string;
  token: string;
  createdAt: Date;
  expiresAt: Date;
  metadata?: Map<string, unknown>;
  tenantId?: string;
}

export interface TokenIdentityRecord {
  _id?: Types.ObjectId | string;
  type?: string;
  identifier?: string;
  createdAt?: Date;
  metadata?: Map<string, unknown> | Record<string, unknown>;
}

export interface TokenCreateData {
  userId: Types.ObjectId | string;
  email?: string;
  type?: string;
  identifier?: string;
  token: string;
  expiresIn: number;
  metadata?: Record<string, unknown> | Map<string, unknown>;
}

export interface TokenStringListQuery {
  $in: string[];
}

export interface TokenQuery {
  userId?: Types.ObjectId | string;
  token?: string;
  email?: string | null;
  type?: string | RegExp | TokenStringListQuery | null;
  identifier?: string | RegExp | TokenStringListQuery | null;
  /** Internal optimistic-concurrency selector for OAuth token record generations. */
  metadataCredentialSetId?: string | null;
}

export interface TokenUpdateData {
  email?: string;
  type?: string;
  identifier?: string;
  token?: string;
  expiresAt?: Date;
  expiresIn?: number;
  metadata?: Record<string, unknown> | Map<string, unknown>;
}

export interface TokenDeleteResult {
  deletedCount?: number;
}
