import type { Types, Document } from 'mongoose';

export interface IAuditLog extends Document {
  actor_id: Types.ObjectId;
  action: string;
  target_user_id: Types.ObjectId;
  payload: Record<string, unknown>;
  created_at: Date;
}

export interface IAuditLogLean {
  _id: Types.ObjectId;
  actor_id: Types.ObjectId;
  action: string;
  target_user_id: Types.ObjectId;
  payload: Record<string, unknown>;
  created_at: Date;
  __v?: number;
}
