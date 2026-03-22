import { Document, Types } from 'mongoose';

export interface IBalance extends Document {
  user: Types.ObjectId;
  tokenCredits: number;
  // Automatic refill settings
  autoRefillEnabled: boolean;
  refillIntervalValue: number;
  refillIntervalUnit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
  lastRefill: Date;
  refillAmount: number;
  /** Per-modelSpec isolated credit pools. Key is the modelSpec name. */
  perModelSpecTokenCredits?: Record<string, number>;
  /** Tracks the last auto-refill timestamp per modelSpec. Key is the modelSpec name. */
  perModelSpecLastRefill?: Record<string, Date>;
}
