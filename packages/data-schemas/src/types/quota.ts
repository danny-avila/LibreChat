import type { Types, Document } from 'mongoose';

export interface IQuota extends Document {
  user_id: Types.ObjectId;
  period_start: Date;
  messages_used: number;
  created_at: Date;
  updated_at: Date;
}

export interface IQuotaLean {
  _id: Types.ObjectId;
  user_id: Types.ObjectId;
  period_start: Date;
  messages_used: number;
  created_at: Date;
  updated_at: Date;
  __v?: number;
}
