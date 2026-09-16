import type {
  MediaApi,
  MediaAsset,
  MediaImportReceipt,
  MediaImportRequest,
  MediaIntegration,
  MediaJob,
  MediaOutput,
  MediaSubmissionReceipt,
  MediaSubmissionRequest,
  MediaThread,
  MediaTurn,
} from 'librechat-data-provider';

/** A reserved UUID-compatible namespace keeps ordinary chat attachment validators working. */
export const MEDIA_FILE_ID_PREFIX: string = 'f17ecafe-';
export function isMediaFileId(fileId: string): boolean {
  return fileId.toLowerCase().startsWith(MEDIA_FILE_ID_PREFIX);
}

/** Scope is always explicit, including for workers running in tenant context. */
export type MediaOwnerScope = { tenantId: string | null; ownerId: string };
/** Durable account fence. It survives removal of the User document. */
export type MediaStoredOwner = MediaOwnerScope & {
  status: 'active' | 'deleting' | 'deleted';
  workIds: string[];
  deletionToken?: string;
  deletionPrepared?: boolean;
  updatedAt: string;
};
export type MediaPage<T> = { items: T[]; nextCursor?: string };
export type MediaPublicationOptions = { maxRetainers: number; maxTitleChars: number };
export type MediaPageInput = { scope: MediaOwnerScope; limit: number; cursor?: string };
export type MediaExecutionSnapshot = {
  connectionId: string;
  modelId: string;
  api: MediaApi;
  endpointRef?: MediaIntegration['endpointRef'];
  credentialName?: string;
  catalogVersion: string;
  /** Hash of destination/account identity, never the credential itself. */
  bindingRevision: string;
  billing?: MediaIntegration['billing'];
  providerTag?: string;
  accountingMode?: 'balance' | 'transactions' | 'none';
};
export type MediaJobFence = {
  scope: MediaOwnerScope;
  jobId: string;
  leaseToken: string;
  expectedVersion: number;
};
export type MediaProviderState = {
  certainty: 'unsubmitted' | 'unknown' | 'submitted' | 'terminal';
  operationId?: string;
  requestId?: string;
  /** Private bounded recovery descriptor. Never included in the public view. */
  recovery?: {
    parts?: Array<
      | { kind: 'text'; ordinal: number; text: string; thoughtSignature?: string }
      | {
          kind: 'image' | 'video';
          ordinal: number;
          type: string;
          url?: string;
          fileId?: string;
          thoughtSignature?: string;
        }
    >;
    usage?: { inputTokens?: number; outputTokens?: number; costUSD?: number };
    terminalStatus?: 'completed' | 'failed' | 'cancelled';
  };
};
export type MediaStoredJob = MediaJob &
  MediaOwnerScope & {
    queueCapacity: number;
    accounting?: {
      settlementId: string;
      phase: 'held' | 'settled';
      credits?: number;
      debtCredits?: number;
    };
    nativeSource?: {
      conversationId: string;
      messageId: string;
      modelRunId: string;
      expiresAt?: string;
    };
    nativeLimits?: { maxParts: number; maxPartBytes: number; maxRecordingBytes: number };
    nativePartKeys?: Array<{ key: string; fingerprint: string; bytes: number }>;
    nativePartBytes?: number;
    clientRequestId: string;
    fingerprint: string;
    request: MediaSubmissionRequest;
    execution: MediaExecutionSnapshot;
    receipt: MediaSubmissionReceipt;
    newThread: boolean;
    threadEpoch: number;
    provider: MediaProviderState;
    dueAt: string;
    activeSlot?: number;
    leaseToken?: string;
    leaseOwner?: string;
    leaseUntil?: string;
    cancelRequestedAt?: string;
    dispatchGrantedAt?: string;
  };
export type MediaStoredThread = MediaThread &
  MediaOwnerScope & {
    status: 'active' | 'retiring' | 'retired';
    epoch: number;
    originRequestId: string;
    nextTurnSequence: number;
    pendingTurnId?: string;
    /** Admission intents are bounded by the active-job capacity. */
    dispatchJobIds: string[];
    coverExplicit?: boolean;
  };
export type MediaStoredTurn = Omit<MediaTurn, 'jobs' | 'assets'> &
  MediaOwnerScope & {
    updatedAt: string;
    sequence?: number;
    threadEpoch: number;
    sourceJobId?: string;
    newThread: boolean;
    importRequest?: MediaImportRequest;
    importIdentityRequest?: MediaImportRequest;
    importReceipt?: MediaImportReceipt;
    clientRequestId?: string;
    fingerprint?: string;
    publicationPhase: 'preparing' | 'accepted' | 'rejected';
  };
export type StageMediaSubmissionInput = {
  scope: MediaOwnerScope;
  request: MediaSubmissionRequest;
  execution: MediaExecutionSnapshot;
  maxActiveJobs: number;
  maxPendingTotal: number;
  executionOwner?: 'media' | 'chat';
};
export type MediaJobObservation = {
  phase: MediaJob['phase'];
  provider?: MediaProviderState;
  outputs?: MediaOutput[];
  error?: MediaJob['error'];
  dueAt?: string;
  /** Keep the lease while writing a provider response, or release it for polling. */
  releaseLease?: boolean;
};
export type MediaAssetContent = MediaAsset & {
  source: string;
  storageKey?: string;
  storageRegion?: string;
  contentDigest: string;
  expiredAt?: string | null;
  hardExpiresAt?: string | null;
};
export type MediaAssetWrite = MediaOwnerScope & {
  writeId: string;
  outputKey: string;
  rendition: string;
  ingestToken: string;
  fileId: string;
  storageKey: string;
  fingerprint: string;
  state: 'reserved' | 'committing' | 'published' | 'abandoned' | 'deleted';
  createdAt: string;
  updatedAt: string;
  asset?: MediaAsset;
  publicationContent?: MediaAssetContent;
  deletionToken?: string;
};
export type MediaSourceFile = Omit<MediaAssetContent, 'contentDigest'> & { sourceRevision: string };
export type MediaPermit = MediaOwnerScope & {
  permitId: string;
  capacityKey: string;
  kind: 'queue' | 'deployment' | 'integration' | 'owner';
  slot: number;
  jobId: string;
  jobIdentity: string;
  createdAt: string;
};

export interface MediaMethods {
  prepareMediaAccountDeletion(input: { scope: MediaOwnerScope; token: string }): Promise<boolean>;
  cancelMediaAccountDeletion(input: { scope: MediaOwnerScope; token: string }): Promise<void>;
  completeMediaAccountDeletion(input: { scope: MediaOwnerScope; token: string }): Promise<void>;
  reconcileMediaAccountDeletion(input: { scope: MediaOwnerScope; limit: number }): Promise<number>;
  activateMedia(): Promise<void>;
  hasMediaActivation(): Promise<boolean>;
  ensureMediaIndexes(): Promise<void>;
  stageMediaSubmission(input: StageMediaSubmissionInput): Promise<MediaSubmissionReceipt>;
  publishMediaSubmission(
    scope: MediaOwnerScope,
    jobId: string,
    options: MediaPublicationOptions,
  ): Promise<MediaSubmissionReceipt | null>;
  getMediaSubmission(
    scope: MediaOwnerScope,
    clientRequestId: string,
  ): Promise<MediaSubmissionReceipt | null>;
  stageMediaImport(input: {
    scope: MediaOwnerScope;
    request: MediaImportRequest;
    identityRequest?: MediaImportRequest;
  }): Promise<MediaImportReceipt>;
  publishMediaImport(
    scope: MediaOwnerScope,
    turnId: string,
    options: MediaPublicationOptions,
  ): Promise<MediaImportReceipt | null>;
  getMediaImport(
    scope: MediaOwnerScope,
    clientRequestId: string,
  ): Promise<MediaImportReceipt | null>;
  getMediaThread(scope: MediaOwnerScope, threadId: string): Promise<MediaThread | null>;
  listMediaThreads(
    input: MediaPageInput & { filter?: 'all' | 'pending' | 'completed' },
  ): Promise<MediaPage<MediaThread>>;
  listMediaTurns(
    input: MediaPageInput & { threadId: string; jobsPerTurn: number },
  ): Promise<MediaPage<MediaTurn>>;
  listMediaTurnJobs(
    input: MediaPageInput & { turnId: string; threadId?: string },
  ): Promise<MediaPage<MediaJob>>;
  getMediaParentContext(
    scope: MediaOwnerScope,
    threadId: string,
    parentTurnId: string,
  ): Promise<MediaStoredJob | null>;
  getMediaJob(scope: MediaOwnerScope, jobId: string): Promise<MediaStoredJob | null>;
  getMediaJobView(scope: MediaOwnerScope, jobId: string): Promise<MediaJob | null>;
  updateMediaThread(input: {
    scope: MediaOwnerScope;
    threadId: string;
    expectedVersion: number;
    title?: string;
    coverFileId?: string | null;
  }): Promise<MediaThread | null>;
  claimMediaJob(input: {
    scope: MediaOwnerScope;
    workerId: string;
    now: string;
    leaseMs: number;
  }): Promise<MediaStoredJob | null>;
  renewMediaJob(
    input: MediaJobFence & { now: string; leaseMs: number },
  ): Promise<MediaStoredJob | null>;
  beginMediaSubmission(input: MediaJobFence & { now: string }): Promise<MediaStoredJob | null>;
  recordMediaJobObservation(
    input: MediaJobFence & { observation: MediaJobObservation; now: string },
  ): Promise<MediaStoredJob | null>;
  cancelMediaJob(scope: MediaOwnerScope, jobId: string): Promise<MediaJob | null>;
  retryMediaJob(input: {
    scope: MediaOwnerScope;
    jobId: string;
    clientRequestId: string;
    maxActiveJobs: number;
    maxPendingTotal: number;
  }): Promise<MediaSubmissionReceipt>;
  retireMediaThread(scope: MediaOwnerScope, threadId: string): Promise<boolean>;
  /** Only call in an explicit system tenant context. Returns identities, never content. */
  listDueMediaScopes(input: {
    now: string;
    limit: number;
    cursor?: string;
  }): Promise<MediaPage<MediaOwnerScope>>;
  recoverMediaPublications(
    input: { scope: MediaOwnerScope; limit: number } & MediaPublicationOptions,
  ): Promise<number>;
  getStoredMediaCredential(input: {
    scope: MediaOwnerScope;
    name: string;
  }): Promise<{ value: string; expiresAt: string | null; bindingRevision: string } | null>;
  reserveMediaAssetWrite(input: {
    scope: MediaOwnerScope;
    outputKey: string;
    rendition: string;
    ingestToken: string;
    fingerprint: string;
    storageKey: string;
  }): Promise<MediaAssetWrite>;
  commitMediaAssetWrite(input: {
    scope: MediaOwnerScope;
    writeId: string;
    content: MediaAssetContent;
  }): Promise<MediaAsset>;
  recoverMediaAssetWrites(input: { scope: MediaOwnerScope; limit: number }): Promise<number>;
  listMediaAssetWritesForCleanup(input: {
    scope: MediaOwnerScope;
    limit: number;
    staleBefore: string;
  }): Promise<MediaAssetWrite[]>;
  claimMediaAssetWriteDeletion(input: {
    scope: MediaOwnerScope;
    writeId: string;
    token: string;
    staleBefore: string;
  }): Promise<{ writeId: string; fileId: string; storageKey: string; token: string } | null>;
  completeMediaAssetWriteDeletion(input: {
    scope: MediaOwnerScope;
    writeId: string;
    token: string;
  }): Promise<boolean>;
  getMediaAsset(scope: MediaOwnerScope, fileId: string): Promise<MediaAsset | null>;
  getPublishedMediaAsset(input: {
    scope: MediaOwnerScope;
    outputKey: string;
    rendition: string;
  }): Promise<MediaAsset | null>;
  getMediaAssetContent(scope: MediaOwnerScope, fileId: string): Promise<MediaAssetContent | null>;
  getMediaSourceFile(scope: MediaOwnerScope, fileId: string): Promise<MediaSourceFile | null>;
  isMediaFile(scope: MediaOwnerScope, fileId: string): Promise<boolean>;
  retainMediaThreadAsset(input: {
    scope: MediaOwnerScope;
    threadId: string;
    fileId: string;
    maxRetainers: number;
  }): Promise<boolean>;
  retainMediaAsset(input: {
    scope: MediaOwnerScope;
    fileId: string;
    retainer: string;
    maxRetainers: number;
  }): Promise<boolean>;
  releaseMediaAsset(input: {
    scope: MediaOwnerScope;
    fileId: string;
    retainer: string;
  }): Promise<boolean>;
  claimMediaAssetDeletion(input: {
    scope: MediaOwnerScope;
    fileId: string;
    token: string;
  }): Promise<MediaAssetContent | null>;
  completeMediaAssetDeletion(input: {
    scope: MediaOwnerScope;
    fileId: string;
    token: string;
  }): Promise<boolean>;
  acquireMediaPermit(input: {
    scope: MediaOwnerScope;
    jobId: string;
    kind: MediaPermit['kind'];
    capacity: number;
    key?: string;
  }): Promise<boolean>;
  releaseMediaPermits(input: {
    scope: MediaOwnerScope;
    jobId: string;
    kind?: MediaPermit['kind'];
  }): Promise<boolean>;
  reconcileMediaPermits(input: {
    limit: number;
    cursor?: string;
  }): Promise<{ inspected: number; nextCursor?: string }>;
  listMediaCleanupScopes(input: {
    limit: number;
    cursor?: string;
    now: string;
  }): Promise<MediaPage<MediaOwnerScope>>;
  reconcileMediaRetirements(input: { scope: MediaOwnerScope; limit: number }): Promise<number>;
  listMediaExpiredAssets(input: {
    scope: MediaOwnerScope;
    limit: number;
    now: string;
  }): Promise<MediaSourceFile[]>;
}
