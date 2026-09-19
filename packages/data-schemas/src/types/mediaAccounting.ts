import type {
  BalancePreparationRequest,
  BalanceReservationResult,
  IBalanceUpdate,
} from './balance';
import type { MediaAppliedSettlement } from './mediaBalance';
import type { MediaOwnerScope, MediaPage } from './media';

export type { MediaHold, MediaAppliedSettlement, MediaPendingSettlement } from './mediaBalance';

export type MediaAccountingPolicy = { maxHoldsPerUser: number; maxAttempts: number };
export type MediaAccountingStep =
  | 'registering'
  | 'checked'
  | 'registered'
  | 'admitted'
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
export type MediaAccountingDependencies = MediaAccountingHooks & {
  prepareBalance?: (request: BalancePreparationRequest) => Promise<BalanceReservationResult | null>;
};
export type MediaSettlementEffect = {
  kind: 'charge' | 'release' | 'debt_collection';
  credits: number;
  costUSD?: number;
  costSource?: 'provider' | 'estimate';
  creditsPerUSD?: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
};
export type MediaSettlementRecord = MediaOwnerScope & {
  settlementId: string;
  jobId: string;
  balanceId?: string;
  estimatedCredits: number;
  maxCredits: number;
  holdFingerprint: string;
  createdAt: string;
  reviewAt: string;
  state: 'initializing' | 'holding' | 'held' | 'ready' | 'applied' | 'published';
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
  initialBalance?: IBalanceUpdate;
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
  costSource?: MediaSettlementEffect['costSource'];
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
