import type { MediaSubmissionRequest } from 'librechat-data-provider';
import type { MediaExecutionSnapshot, MediaOwnerScope, MediaStoredJob } from './media';

export type MediaNativeSource = NonNullable<MediaStoredJob['nativeSource']>;
export type MediaNativeLimits = NonNullable<MediaStoredJob['nativeLimits']>;
export type MediaNativePart =
  | { kind: 'text'; text: string; thoughtSignature?: string }
  | { kind: 'image'; mimeType: string; fileId: string; thoughtSignature?: string };
export type MediaNativePartRecord = MediaOwnerScope & {
  continuationRef: string;
  jobId: string;
  chunkIndex: number;
  partIndex: number;
  fingerprint: string;
  part: MediaNativePart;
  fileId?: string;
  createdAt: string;
  expiresAt?: string;
};
export type MediaNativePartReservation = NonNullable<MediaStoredJob['nativePartKeys']>[number];

export interface MediaNativeMethods {
  ensureMediaNativeIndexes(): Promise<void>;
  startMediaNativeRecording(input: {
    scope: MediaOwnerScope;
    source: MediaNativeSource;
    request: MediaSubmissionRequest;
    execution: MediaExecutionSnapshot;
    maxRetainers: number;
    maxTitleChars: number;
    limits: MediaNativeLimits;
  }): Promise<MediaStoredJob>;
  recordMediaNativePart(input: {
    scope: MediaOwnerScope;
    jobId: string;
    chunkIndex: number;
    partIndex: number;
    part: MediaNativePart;
    maxRetainers: number;
  }): Promise<{ continuationRef: string }>;
  completeMediaNativeRecording(input: {
    scope: MediaOwnerScope;
    jobId: string;
  }): Promise<MediaStoredJob | null>;
  failMediaNativeRecording(input: {
    scope: MediaOwnerScope;
    jobId: string;
    reason: 'aborted' | 'provider' | 'storage';
  }): Promise<MediaStoredJob | null>;
  reconcileMediaNativeRecordings(input: {
    scope: MediaOwnerScope;
    now: string;
    staleBefore: string;
    limit: number;
  }): Promise<number>;
  getMediaNativeContinuation(input: {
    scope: MediaOwnerScope;
    continuationRef?: string;
    fileId?: string;
    execution: Pick<MediaExecutionSnapshot, 'api' | 'modelId' | 'bindingRevision'>;
  }): Promise<MediaNativePartRecord | null>;
}
