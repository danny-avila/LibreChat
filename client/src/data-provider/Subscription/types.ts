export type TSubscriptionResponse = {
  enabled?: boolean;
  isPro?: boolean;
  entitlementId?: string | null;
  currentPlan?: string | null;
  store?: string | null;
  expiresAt?: string | null;
  managementUrl?: string | null;
  freeMessagesRemaining?: number;
  freeMessagesUsed?: number;
  freeMessagesLimit?: number;
  period?: string | null;
};

export type TSubscriptionCheckoutResponse = {
  url?: string | null;
};
