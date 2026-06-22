import type { Types, Document } from 'mongoose';

export interface IUsageLog extends Document {
  user_id: Types.ObjectId;
  model_id: string;
  day: Date;
  prompt_tokens: number;
  completion_tokens: number;
  call_count: number;
  estimated_cost_cents: number;
  updated_at: Date;
}

export interface IUsageLogLean {
  _id: Types.ObjectId;
  user_id: Types.ObjectId;
  model_id: string;
  day: Date;
  prompt_tokens: number;
  completion_tokens: number;
  call_count: number;
  estimated_cost_cents: number;
  updated_at: Date;
  __v?: number;
}
