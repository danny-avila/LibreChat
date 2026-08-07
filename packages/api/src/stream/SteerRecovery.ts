import type { TFile, TPendingSteer } from 'librechat-data-provider';

/** Immutable user-visible payload a parked steer recovery is allowed to submit. */
export interface RecoveredSteerPayload {
  text: string;
  /** Sorted, unique file ids. Display metadata is deliberately excluded: the
   * normal send path re-resolves files by owner and only identity is binding. */
  fileIds: string[];
}

/** A recovery-shaped request did not reproduce the parked source exactly. */
export class RecoveredSteerPayloadMismatchError extends Error {
  readonly code = 'RECOVERY_PAYLOAD_MISMATCH';

  constructor() {
    super('Recovered steer payload does not match its parked source');
    this.name = 'RecoveredSteerPayloadMismatchError';
  }
}

/** Canonical attachment identity: every entry must name a file; ordering,
 * duplicates, and mutable display metadata do not affect identity. */
export function canonicalRecoveryFileIds(files: unknown): string[] | null {
  if (files == null) {
    return [];
  }
  if (!Array.isArray(files)) {
    return null;
  }
  const ids = new Set<string>();
  for (const file of files) {
    if (file == null || typeof file !== 'object') {
      return null;
    }
    const fileId = (file as Partial<TFile>).file_id;
    if (typeof fileId !== 'string' || fileId.length === 0) {
      return null;
    }
    ids.add(fileId);
  }
  return [...ids].sort();
}

/** Build the trusted payload proof passed from the HTTP controller into the
 * atomic job-creation transaction. `null` means the recovery request itself
 * is malformed and must be rejected before claiming a generation. */
export function buildRecoveredSteerPayload(
  text: unknown,
  files: unknown,
): RecoveredSteerPayload | null {
  if (typeof text !== 'string') {
    return null;
  }
  const fileIds = canonicalRecoveryFileIds(files);
  return fileIds == null ? null : { text, fileIds };
}

export function isRecoveredSteerPayload(value: unknown): value is RecoveredSteerPayload {
  if (value == null || typeof value !== 'object') {
    return false;
  }
  const payload = value as Partial<RecoveredSteerPayload>;
  return (
    typeof payload.text === 'string' &&
    Array.isArray(payload.fileIds) &&
    payload.fileIds.every((id) => typeof id === 'string' && id.length > 0) &&
    payload.fileIds.length === new Set(payload.fileIds).size &&
    payload.fileIds.every((id, index) => index === 0 || payload.fileIds![index - 1] < id)
  );
}

export function recoveredSteerPayloadMatches(
  item: Pick<TPendingSteer, 'text' | 'files'>,
  expected: RecoveredSteerPayload,
): boolean {
  const fileIds = canonicalRecoveryFileIds(item.files);
  return (
    item.text === expected.text &&
    fileIds != null &&
    fileIds.length === expected.fileIds.length &&
    fileIds.every((id, index) => id === expected.fileIds[index])
  );
}
