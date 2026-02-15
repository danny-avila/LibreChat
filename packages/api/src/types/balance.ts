export interface BalanceUpdateFields {
  user?: string;
  tokenCredits?: number;
  perSpecTokenCredits?: Record<string, number> | null;
  autoRefillEnabled?: boolean;
  refillIntervalValue?: number;
  refillIntervalUnit?: string;
  refillAmount?: number;
  lastRefill?: Date;
}
