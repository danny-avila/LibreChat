import type { Document, Types } from 'mongoose';

export interface IMagicLink extends Document {
  token: string;
  email: string;
  createdBy: Types.ObjectId;
  active: boolean;
  userId?: Types.ObjectId;
  createdAt: Date;
  lastUsedAt?: Date;
  useCount: number;
  tenantId?: string;
}

export interface MagicLinkCreateData {
  token: string;
  email: string;
  createdBy: Types.ObjectId | string;
  tenantId?: string;
}

export interface MagicLinkView {
  id: string;
  email: string;
  createdBy: string;
  active: boolean;
  useCount: number;
  lastUsedAt?: Date;
  createdAt: Date;
  userId?: string;
}
