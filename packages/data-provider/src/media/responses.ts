import { z } from 'zod';
import {
  MEDIA_SCHEMA_VERSION,
  mediaIdSchema,
  mediaInputSchema,
  mediaOperationSchema,
  mediaSelectionSchema,
  mediaSourceURLSchema,
} from './requests';

const version = z.number().int().positive().safe();
const timestamp = z.string().datetime();
const schemaVersion = z.literal(MEDIA_SCHEMA_VERSION);
export const mediaErrorCodeSchema = z.enum([
  'invalid_request',
  'reference_unavailable',
  'reference_changed',
  'not_found',
  'forbidden',
  'disabled',
  'unsupported',
  'stale_catalog',
  'version_conflict',
  'request_conflict',
  'quota_exceeded',
  'queue_expired',
  'credentials_required',
  'credentials_expired',
  'provider_rejected',
  'submission_uncertain',
  'storage_failed',
  'output_expired',
  'cancel_unsupported',
  'not_ready',
  'internal_error',
]);
export const mediaErrorSchema = z
  .object({
    code: mediaErrorCodeSchema,
    field: z.string().optional(),
  })
  .strict();
export const mediaRenditionKindSchema = z.enum(['thumbnail', 'poster', 'playback']);
export const mediaRenditionSchema = z
  .object({
    filepath: z.string().min(1),
    type: z.string().min(1),
    bytes: z.number().int().nonnegative().safe(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    durationSeconds: z.number().finite().nonnegative().optional(),
  })
  .strict();
export const mediaRenditionsSchema = z
  .object({
    thumbnail: mediaRenditionSchema.optional(),
    poster: mediaRenditionSchema.optional(),
    playback: mediaRenditionSchema.optional(),
  })
  .strict();
export const mediaAssetSchema = z
  .object({
    file_id: mediaIdSchema,
    filename: z.string(),
    type: z.string().min(1),
    bytes: z.number().int().nonnegative().safe(),
    filepath: z.string().min(1),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    durationSeconds: z.number().finite().nonnegative().optional(),
    renditions: mediaRenditionsSchema.optional(),
  })
  .strict();
const assetOutputFields = {
  outputId: mediaIdSchema,
  ordinal: z.number().int().nonnegative(),
  state: z.enum(['pending', 'ready', 'failed', 'expired']),
  asset: mediaAssetSchema.optional(),
  error: mediaErrorSchema.optional(),
};
export const mediaOutputSchema = z
  .discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('text'),
        outputId: mediaIdSchema,
        ordinal: z.number().int().nonnegative(),
        text: z.string(),
      })
      .strict(),
    z.object({ ...assetOutputFields, kind: z.literal('image') }).strict(),
    z.object({ ...assetOutputFields, kind: z.literal('video') }).strict(),
  ])
  .superRefine((output, ctx) => {
    if (output.kind !== 'text' && output.state === 'ready' && !output.asset) {
      ctx.addIssue({
        code: 'custom',
        path: ['asset'],
        message: 'A ready output requires an asset',
      });
    }
  });
export const mediaJobPhaseSchema = z.enum([
  'queued',
  'submitting',
  'running',
  'ingesting',
  'reconciling',
  'requires_attention',
  'succeeded',
  'failed',
  'cancelled',
]);
export const mediaJobSchema = z
  .object({
    schemaVersion,
    jobId: mediaIdSchema,
    threadId: mediaIdSchema,
    turnId: mediaIdSchema,
    version,
    phase: mediaJobPhaseSchema,
    executionOwner: z.enum(['media', 'chat']),
    operation: mediaOperationSchema,
    selection: mediaSelectionSchema,
    createdAt: timestamp,
    updatedAt: timestamp,
    outputs: z.array(mediaOutputSchema),
    outputsNextCursor: mediaIdSchema.optional(),
    error: mediaErrorSchema.optional(),
    allowedActions: z.object({ cancel: z.boolean(), retry: z.boolean() }).strict(),
    retryOfJobId: mediaIdSchema.optional(),
    cancellation: z.enum(['requested', 'confirmed']).optional(),
  })
  .strict();
export const mediaThreadSchema = z
  .object({
    schemaVersion,
    threadId: mediaIdSchema,
    version,
    title: z.string(),
    createdAt: timestamp,
    updatedAt: timestamp,
    pendingJobCount: z.number().int().nonnegative(),
    turnCount: z.number().int().nonnegative(),
    cover: mediaAssetSchema.optional(),
    /** Present on temporary creations; the thread retires itself at this time. */
    expiresAt: timestamp.optional(),
    activity: z
      .object({
        readyOutputs: z.number().int().nonnegative(),
        latestJob: z
          .object({
            phase: mediaJobPhaseSchema,
            operation: mediaOperationSchema,
            selection: mediaSelectionSchema,
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    retiredAt: timestamp.optional(),
  })
  .strict();
export const mediaTurnSchema = z
  .object({
    schemaVersion,
    threadId: mediaIdSchema,
    turnId: mediaIdSchema,
    version,
    kind: z.enum(['generation', 'import']),
    sequence: z.number().int().nonnegative().optional(),
    parentTurnId: mediaIdSchema.optional(),
    createdAt: timestamp,
    prompt: z.string(),
    inputs: z.array(mediaInputSchema),
    selection: mediaSelectionSchema.optional(),
    operation: mediaOperationSchema.optional(),
    jobs: z.array(mediaJobSchema),
    jobsNextCursor: mediaIdSchema.optional(),
    assets: z.array(mediaAssetSchema),
    comparisonId: mediaIdSchema.optional(),
  })
  .strict();

const receiptFields = {
  schemaVersion,
  clientRequestId: mediaIdSchema,
  threadId: mediaIdSchema,
  turnId: mediaIdSchema,
};
export const mediaSubmissionReceiptSchema = z.discriminatedUnion('phase', [
  z.object({ ...receiptFields, jobId: mediaIdSchema, phase: z.literal('preparing') }).strict(),
  z.object({ ...receiptFields, jobId: mediaIdSchema, phase: z.literal('accepted') }).strict(),
  z
    .object({
      ...receiptFields,
      jobId: mediaIdSchema,
      phase: z.literal('rejected'),
      error: mediaErrorSchema,
    })
    .strict(),
]);
export const mediaImportReceiptSchema = z.discriminatedUnion('phase', [
  z.object({ ...receiptFields, phase: z.literal('preparing') }).strict(),
  z.object({ ...receiptFields, phase: z.literal('accepted') }).strict(),
  z.object({ ...receiptFields, phase: z.literal('rejected'), error: mediaErrorSchema }).strict(),
]);
export const mediaThreadPageSchema = z
  .object({
    items: z.array(mediaThreadSchema),
    nextCursor: mediaIdSchema.optional(),
  })
  .strict();
export const mediaTurnPageSchema = z
  .object({
    items: z.array(mediaTurnSchema),
    nextCursor: mediaIdSchema.optional(),
  })
  .strict();
export const mediaJobPageSchema = z
  .object({
    items: z.array(mediaJobSchema),
    nextCursor: mediaIdSchema.optional(),
  })
  .strict();
export const mediaOutputPageSchema = z
  .object({
    items: z.array(mediaOutputSchema),
    nextCursor: mediaIdSchema.optional(),
  })
  .strict();
export const mediaThreadDetailSchema = z
  .object({
    thread: mediaThreadSchema,
    turns: mediaTurnPageSchema,
  })
  .strict();
export const mediaDeletionReceiptSchema = z
  .object({
    threadId: mediaIdSchema,
    phase: z.enum(['retiring', 'retired']),
  })
  .strict();
export const mediaUploadResponseSchema = z.object({ file: mediaAssetSchema }).strict();
export const mediaURLUploadResponseSchema = z
  .object({ file: mediaAssetSchema, sourceURL: mediaSourceURLSchema })
  .strict();
export const mediaStartupConfigSchema = z
  .object({
    enabled: z.boolean(),
    studio: z.boolean(),
    chat: z.boolean(),
    canCreate: z.boolean(),
    clientPollIntervalMs: z.number().int().positive(),
    clientCatchUpIntervalMs: z.number().int().positive(),
  })
  .strict();

export type MediaErrorCode = z.infer<typeof mediaErrorCodeSchema>;
export type MediaError = z.infer<typeof mediaErrorSchema>;
export type MediaAsset = z.infer<typeof mediaAssetSchema>;
export type MediaRenditionKind = z.infer<typeof mediaRenditionKindSchema>;
export type MediaRendition = z.infer<typeof mediaRenditionSchema>;
export type MediaRenditions = z.infer<typeof mediaRenditionsSchema>;
export type MediaOutput = z.infer<typeof mediaOutputSchema>;
export type MediaJobPhase = z.infer<typeof mediaJobPhaseSchema>;
export type MediaJob = z.infer<typeof mediaJobSchema>;
export type MediaThread = z.infer<typeof mediaThreadSchema>;
export type MediaTurn = z.infer<typeof mediaTurnSchema>;
export type MediaSubmissionReceipt = z.infer<typeof mediaSubmissionReceiptSchema>;
export type MediaImportReceipt = z.infer<typeof mediaImportReceiptSchema>;
export type MediaThreadPage = z.infer<typeof mediaThreadPageSchema>;
export type MediaTurnPage = z.infer<typeof mediaTurnPageSchema>;
export type MediaJobPage = z.infer<typeof mediaJobPageSchema>;
export type MediaOutputPage = z.infer<typeof mediaOutputPageSchema>;
export type MediaThreadDetail = z.infer<typeof mediaThreadDetailSchema>;
export type MediaDeletionReceipt = z.infer<typeof mediaDeletionReceiptSchema>;
export type MediaUploadResponse = z.infer<typeof mediaUploadResponseSchema>;
export type MediaURLUploadResponse = z.infer<typeof mediaURLUploadResponseSchema>;
export type MediaStartupConfig = z.infer<typeof mediaStartupConfigSchema>;
