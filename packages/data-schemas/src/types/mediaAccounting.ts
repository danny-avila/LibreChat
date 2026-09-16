import type { MediaOwnerScope, MediaPage } from './media';

export type MediaAccountingPolicy = { maxHoldsPerUser: number; maxAttempts: number };
export type MediaAccountingStep =
  | 'pinned'
  | 'held'
  | 'effect'
  | 'allocated'
  | 'assigned'
  | 'applied'
  | 'projected'
  | 'ledger'
  | 'published'
  | 'cleared';
export type MediaAccountingHooks = { afterStep?: (step: MediaAccountingStep) => Promise<void> };
export type MediaHold = { settlementId: string; jobId: string; amount: number; reviewAt: string };
export type MediaSettlementEffect = {
  kind: 'charge' | 'release' | 'debt_collection';
  credits: number;
  costUSD?: number;
  creditsPerUSD?: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
};
export type MediaAppliedSettlement = {
  debitedCredits: number;
  debtCredits: number;
  releasedCredits: number;
  remainingCredits: number;
};
export type MediaPendingSettlement = {
  settlementId: string;
  sequence: number;
  phase: 'allocated' | 'applied';
  result?: MediaAppliedSettlement;
};
export type MediaSettlementRecord = MediaOwnerScope & {
  settlementId: string;
  jobId: string;
  balanceId: string;
  estimatedCredits: number;
  maxCredits: number;
  holdFingerprint: string;
  createdAt: string;
  reviewAt: string;
  state: 'holding' | 'held' | 'ready' | 'applied' | 'published';
  effect?: MediaSettlementEffect;
  effectFingerprint?: string;
  sequence?: number;
  result?: MediaAppliedSettlement;
  balanceAcknowledged: boolean;
};
export type MediaHoldResult = {
  status: 'held' | 'insufficient' | 'settled' | 'unavailable' | 'busy';
  settlementId: string;
  availableCredits?: number;
};
export type MediaSettlementResult = {
  status: 'settled' | 'pending';
  settlementId: string;
  result?: MediaAppliedSettlement;
};
export type AcquireMediaHoldInput = {
  scope: MediaOwnerScope;
  jobId: string;
  estimatedCredits: number;
  maxCredits: number;
  reviewAt: string;
  now: string;
  policy: MediaAccountingPolicy;
};
export type SettleMediaJobInput = {
  scope: MediaOwnerScope;
  jobId: string;
  effect: MediaSettlementEffect;
  policy: MediaAccountingPolicy;
};
export type RecordMediaUsageInput = {
  scope: MediaOwnerScope;
  jobId: string;
  credits?: number;
  costUSD?: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
};
export interface MediaAccountingMethods {
  ensureMediaAccountingIndexes(): Promise<void>;
  listMediaAccountingScopes(input: {
    limit: number;
    cursor?: string;
  }): Promise<MediaPage<MediaOwnerScope>>;
  hasMediaAccountingObligations(scope: MediaOwnerScope): Promise<boolean>;
  deleteMediaAccountingHistory(scope: MediaOwnerScope): Promise<void>;
  acquireMediaHold(input: AcquireMediaHoldInput): Promise<MediaHoldResult>;
  settleMediaJob(input: SettleMediaJobInput): Promise<MediaSettlementResult>;
  releaseMediaHold(
    input: Omit<SettleMediaJobInput, 'effect'> & { certainNoCharge: true },
  ): Promise<MediaSettlementResult>;
  reconcileMediaAccounting(input: {
    scope: MediaOwnerScope;
    limit: number;
    policy: MediaAccountingPolicy;
  }): Promise<number>;
  recordMediaUsage(input: RecordMediaUsageInput): Promise<void>;
}
