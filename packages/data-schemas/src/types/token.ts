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
}

export interface TokenCreateData {
  userId: Types.ObjectId | string;
  email?: string;
  type?: string;
  identifier?: string;
  token: string;
  expiresIn: number;
  metadata?: Map<string, unknown>;
}

export interface TokenQuery {
  userId?: Types.ObjectId | string;
  token?: string;
  email?: string;
  identifier?: string;
}

export interface TokenUpdateData {
  email?: string;
  type?: string;
  identifier?: string;
  token?: string;
  expiresAt?: Date;
  metadata?: Map<string, unknown>;
}

export interface TokenDeleteResult {
  deletedCount?: number;
}
