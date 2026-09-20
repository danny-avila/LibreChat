import type { MediaSubmissionReceipt } from 'librechat-data-provider';
import type { FilterQuery, PipelineStage } from 'mongoose';
import type {
  MediaJobFence,
  MediaMethods,
  MediaOwnerScope,
  MediaStoredJob,
  MediaStoredThread,
  MediaStoredTurn,
  StageMediaSubmissionInput,
} from '~/types/media';
import {
  createMediaActivationModel,
  createMediaAssetWriteModel,
  createMediaJobModel,
  createMediaOwnerModel,
  createMediaPermitModel,
  createMediaPresetModel,
  createMediaThreadModel,
  createMediaTurnModel,
} from '~/models/media';
import { createMediaAccountingMethods } from '../mediaAccounting';
import { createFileModel } from '~/models/file';
type PermitRequest = Parameters<MediaMethods['acquireMediaPermit']>[0];

/** Explicit dependencies between persistence aggregates; all methods share one connection. */
export type MediaPersistenceContext = {
  File: ReturnType<typeof createFileModel>;
  Thread: ReturnType<typeof createMediaThreadModel>;
  Turn: ReturnType<typeof createMediaTurnModel>;
  Job: ReturnType<typeof createMediaJobModel>;
  AssetWrite: ReturnType<typeof createMediaAssetWriteModel>;
  Permit: ReturnType<typeof createMediaPermitModel>;
  Activation: ReturnType<typeof createMediaActivationModel>;
  Owner: ReturnType<typeof createMediaOwnerModel>;
  Preset: ReturnType<typeof createMediaPresetModel>;
  accounting: ReturnType<typeof createMediaAccountingMethods>;
  mongoose: typeof import('mongoose');
  ownerExists: (scope: MediaOwnerScope) => Promise<boolean>;
  getJob: MediaMethods['getMediaJob'];
  ensureMediaIndexes: () => Promise<void>;
  ensureOwner: (scope: MediaOwnerScope) => Promise<void>;
  assertOwnerActive: (scope: MediaOwnerScope) => Promise<void>;
  admitOwnerWork: (scope: MediaOwnerScope, workId: string) => Promise<boolean>;
  releaseOwnerWork: (scope: MediaOwnerScope, workId: string) => Promise<void>;
  currentThread: (scope: MediaOwnerScope, threadId?: string) => Promise<MediaStoredThread | null>;
  stage: (
    input: StageMediaSubmissionInput,
    retry?: MediaStoredJob,
  ) => Promise<MediaSubmissionReceipt>;
  admitQueue: (job: MediaStoredJob) => Promise<MediaSubmissionReceipt>;
  ensureThread: (
    turn: MediaStoredTurn,
    title: string,
    expiresAt?: Date,
    temporary?: boolean,
  ) => Promise<MediaStoredThread>;
  assignSequence: (scope: MediaOwnerScope, turnId: string) => Promise<void>;
  pinInputs: (turn: MediaStoredTurn, maxRetainers: number) => Promise<void>;
  publishTurn: (
    turn: MediaStoredTurn,
    maxRetainers: number,
    maxTitleChars: number,
    expiresAt?: Date,
    temporary?: boolean,
  ) => Promise<void>;
  refreshThread: (scope: MediaOwnerScope, threadId: string) => Promise<void>;
  publishMediaSubmission: MediaMethods['publishMediaSubmission'];
  stageMediaImport: MediaMethods['stageMediaImport'];
  publishMediaImport: MediaMethods['publishMediaImport'];
  getMediaThread: MediaMethods['getMediaThread'];
  listMediaThreads: MediaMethods['listMediaThreads'];
  pageTurnJobs: MediaMethods['listMediaTurnJobs'];
  listMediaTurnJobs: MediaMethods['listMediaTurnJobs'];
  getMediaAsset: MediaMethods['getMediaAsset'];
  listMediaTurns: MediaMethods['listMediaTurns'];
  fenceQuery: (input: MediaJobFence, now: Date | string) => FilterQuery<MediaStoredJob>;
  getMediaLatestImageContext: MediaMethods['getMediaLatestImageContext'];
  claimMediaJob: MediaMethods['claimMediaJob'];
  renewMediaJob: MediaMethods['renewMediaJob'];
  beginMediaSubmission: MediaMethods['beginMediaSubmission'];
  releaseMediaJobLease: MediaMethods['releaseMediaJobLease'];
  recordMediaJobObservation: MediaMethods['recordMediaJobObservation'];
  cancelMediaJob: MediaMethods['cancelMediaJob'];
  retryMediaJob: MediaMethods['retryMediaJob'];
  cancelRetiringThreadJobs: (scope: MediaOwnerScope, threadId: string) => Promise<void>;
  retireMediaThread: MediaMethods['retireMediaThread'];
  retireAllMediaThreads: MediaMethods['retireAllMediaThreads'];
  retireExpiredMediaThreads: MediaMethods['retireExpiredMediaThreads'];
  globalScopes: (
    kind: 'job' | 'turn' | 'thread' | 'file' | 'owner' | 'write' | 'preset',
    query: PipelineStage.Match['$match'],
    limit: number,
  ) => Promise<MediaOwnerScope[]>;
  listDueMediaScopes: MediaMethods['listDueMediaScopes'];
  recoverMediaPublications: MediaMethods['recoverMediaPublications'];
  replaceMediaThreadTitle: MediaMethods['replaceMediaThreadTitle'];
  updateMediaThread: MediaMethods['updateMediaThread'];
  reserveMediaAssetWrite: MediaMethods['reserveMediaAssetWrite'];
  commitMediaAssetWrite: MediaMethods['commitMediaAssetWrite'];
  recoverMediaAssetWrites: MediaMethods['recoverMediaAssetWrites'];
  listMediaAssetWritesForCleanup: MediaMethods['listMediaAssetWritesForCleanup'];
  incrementMediaAssetWriteDeletionAttempts: MediaMethods['incrementMediaAssetWriteDeletionAttempts'];
  deferMediaAssetWriteCleanup: MediaMethods['deferMediaAssetWriteCleanup'];
  claimMediaAssetWriteDeletion: MediaMethods['claimMediaAssetWriteDeletion'];
  completeMediaAssetWriteDeletion: MediaMethods['completeMediaAssetWriteDeletion'];
  retainMediaAsset: MediaMethods['retainMediaAsset'];
  getMediaAssetContent: MediaMethods['getMediaAssetContent'];
  releaseMediaAsset: MediaMethods['releaseMediaAsset'];
  claimMediaAssetDeletion: MediaMethods['claimMediaAssetDeletion'];
  completeMediaAssetDeletion: MediaMethods['completeMediaAssetDeletion'];
  activateMedia: MediaMethods['activateMedia'];
  hasMediaActivation: MediaMethods['hasMediaActivation'];
  acquirePermit: (input: PermitRequest) => Promise<{ acquired: boolean; permitId?: string }>;
  acquireMediaPermit: MediaMethods['acquireMediaPermit'];
  acquireMediaPermits: MediaMethods['acquireMediaPermits'];
  releaseMediaPermits: MediaMethods['releaseMediaPermits'];
  reconcileMediaPermits: MediaMethods['reconcileMediaPermits'];
  getMediaSourceFile: MediaMethods['getMediaSourceFile'];
  isMediaFile: MediaMethods['isMediaFile'];
  getPublishedMediaAsset: MediaMethods['getPublishedMediaAsset'];
  retainMediaThreadAsset: MediaMethods['retainMediaThreadAsset'];
  reconcileMediaRetirements: MediaMethods['reconcileMediaRetirements'];
  purgeMediaThreadPayloads: MediaMethods['purgeMediaThreadPayloads'];
  prepareMediaAccountDeletion: MediaMethods['prepareMediaAccountDeletion'];
  cancelMediaAccountDeletion: MediaMethods['cancelMediaAccountDeletion'];
  purgeDeletedAccountAccounting: (scope: MediaOwnerScope) => Promise<void>;
  completeMediaAccountDeletion: MediaMethods['completeMediaAccountDeletion'];
  reconcileMediaAccountDeletion: MediaMethods['reconcileMediaAccountDeletion'];
  listMediaRetiringAssets: MediaMethods['listMediaRetiringAssets'];
  listMediaCleanupScopes: MediaMethods['listMediaCleanupScopes'];
};
