import type { MediaOwnerScope } from './media';

export type MediaConsumerConfig = {
  maxAssetRetainers: number;
  consumerClaimMs: number;
  consumerReconcileMs: number;
};

export type MediaConsumerClaim = {
  token: string;
  conversationId: string;
  expiresAt: Date;
};

export type MediaFileConsumerWrite = {
  scope: MediaOwnerScope;
  conversationId: string;
  fileIds: string[];
  token: string;
  config: MediaConsumerConfig;
};

export interface MediaFileConsumerMethods {
  acquireMediaFileConsumers(input: MediaFileConsumerWrite): Promise<void>;
  confirmMediaFileConsumers(input: MediaFileConsumerWrite): Promise<void>;
  releaseMediaFileConsumerClaims(input: MediaFileConsumerWrite): Promise<void>;
  reconcileMediaFileConsumers(input: {
    scope: MediaOwnerScope;
    limit: number;
    cursor?: string;
    conversationId?: string;
    now?: string;
    retryMs?: number;
  }): Promise<{ inspected: number; nextCursor?: string }>;
}
