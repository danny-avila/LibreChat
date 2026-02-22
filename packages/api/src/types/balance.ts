export interface BalanceUpdateFields {
  user?: string;
  tokenCredits?: number;
  autoRefillEnabled?: boolean;
  refillIntervalValue?: number;
  refillIntervalUnit?: string;
  refillAmount?: number;
  lastRefill?: Date;
}
