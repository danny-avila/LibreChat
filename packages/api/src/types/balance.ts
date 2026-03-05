export interface BalanceUpdateFields {
  user?: string;
  tokenCredits?: number;
  autoRefillEnabled?: boolean;
  refillIntervalValue?: number;
  refillIntervalUnit?: string;
  refillAmount?: number;
  lastRefill?: Date;
  /** Per-modelSpec isolated credit pools. Key is the modelSpec name. */
  perModelSpecTokenCredits?: Record<string, number>;
  /** Tracks the last auto-refill timestamp per modelSpec. Key is the modelSpec name. */
  perModelSpecLastRefill?: Record<string, Date>;
}
