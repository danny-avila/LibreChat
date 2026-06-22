import type { Types, Document } from 'mongoose';
import type { PlanCode, SubStatus, PlanChangeSource } from 'librechat-data-provider';

export interface ISubscription extends Document {
  user_id: Types.ObjectId;
  plan_code: PlanCode;
  status: SubStatus;
  source: PlanChangeSource;
  current_period_start: Date;
  current_period_end: Date;
  external_ref: string | null;
  granted_by: Types.ObjectId | null;
  metadata: Record<string, string>;
  created_at: Date;
  updated_at: Date;
}

export interface ISubscriptionLean {
  _id: Types.ObjectId;
  user_id: Types.ObjectId;
  plan_code: PlanCode;
  status: SubStatus;
  source: PlanChangeSource;
  current_period_start: Date;
  current_period_end: Date;
  external_ref: string | null;
  granted_by: Types.ObjectId | null;
  metadata: Record<string, string>;
  created_at: Date;
  updated_at: Date;
  __v?: number;
}
