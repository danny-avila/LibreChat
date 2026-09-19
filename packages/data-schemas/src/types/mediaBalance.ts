export type MediaHold = { settlementId: string; jobId: string; amount: number; reviewAt: string };
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
