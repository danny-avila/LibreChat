import { hasActivePiiPatterns } from 'librechat-data-provider';
import type { FileFilterField, FiltersConfig } from 'librechat-data-provider';
import {
  ContentTraversalLimitError,
  escapeJsonPointer,
  isDataUri,
  isLikelyEncodedPayload,
} from './adapters/nested';

type UninspectablePolicy = 'allow' | 'block';

type FilePiiConfig = NonNullable<FiltersConfig['files']>['pii'] & {
  readonly uninspectable?: UninspectablePolicy;
};

export interface UninspectableFileBlockResponse {
  readonly error: 'content_filter_uninspectable';
  readonly message: string;
  readonly source: 'file';
  readonly field: FileFilterField;
}

interface PendingOpaqueValue {
  readonly value: unknown;
  readonly path: string;
  readonly depth: number;
}

export interface CanonicalFileInspectionFile {
  readonly file_id?: string;
  readonly filename?: string;
  readonly filepath?: string;
  readonly type?: string;
  readonly source?: string;
  readonly content?: string;
  readonly extractedText?: string;
  readonly text?: string;
  readonly transcript?: string;
}

export interface CanonicalFileInspectionCoverage {
  readonly content?: string;
  readonly extractedText?: string;
  readonly transcript?: string;
  readonly transcriptApplicable: boolean;
}

export interface CanonicalFileInspectionUser {
  readonly id?: string;
  readonly tenantId?: string | null;
}

export type GetCanonicalFilesForInspection = (
  filter: {
    file_id: { $in: string[] };
    user: string;
    tenantId?: string | null;
  },
  sort: object,
  select: object,
) => Promise<CanonicalFileInspectionFile[] | null | undefined>;

export interface CanonicalFileReferenceInspectionInput<T> {
  readonly filters?: FiltersConfig;
  readonly input: T;
  readonly user?: CanonicalFileInspectionUser;
  readonly liveFiles?: readonly CanonicalFileInspectionFile[];
  readonly getFiles: GetCanonicalFilesForInspection;
}

export interface CanonicalFileReferenceInspection<T> {
  readonly sanitizedInput: T;
  readonly hydratedFiles: CanonicalFileInspectionFile[];
  readonly hydratedFilters?: FiltersConfig;
}

const MAX_OPAQUE_DEPTH = 24;
const MAX_OPAQUE_NODES = 4096;
const CONTENT_FIELDS = ['content'] as const;
const AUDIO_FIELDS = ['content', 'transcript'] as const;
const DERIVED_FILE_FIELDS = ['content', 'extracted_text', 'transcript'] as const;
const TEXTUAL_APPLICATION_MIME_TYPES = new Set([
  'application/json',
  'application/javascript',
  'application/sql',
  'application/xml',
  'application/x-yaml',
  'application/yaml',
]);

function getFilePii(filters: FiltersConfig | undefined): FilePiiConfig | undefined {
  return filters?.files?.pii as FilePiiConfig | undefined;
}

export function isFileFilterFieldEnabled(
  filters: FiltersConfig | undefined,
  field: FileFilterField,
): boolean {
  const pii = getFilePii(filters);
  return pii != null && (pii.fields == null || pii.fields.includes(field));
}

export function getBlockedUninspectableFileField(
  filters: FiltersConfig | undefined,
  fields: readonly FileFilterField[],
): FileFilterField | null {
  const pii = getFilePii(filters);
  if (pii?.uninspectable !== 'block') {
    return null;
  }
  for (const field of fields) {
    if (pii.fields == null || pii.fields.includes(field)) {
      return field;
    }
  }
  return null;
}

/**
 * Skill bundle text cannot be safely skipped when the skill policy selects
 * `file_text`, even if the independent file policy is absent or explicitly in
 * compatibility mode. The returned file field preserves the existing
 * uninspectable response contract used by file upload and runtime paths.
 */
export function getBlockedUninspectableSkillFileField(
  filters: FiltersConfig | undefined,
  fileFields: readonly FileFilterField[] = ['content', 'extracted_text'],
): FileFilterField | null {
  const blockedFileField = getBlockedUninspectableFileField(filters, fileFields);
  if (blockedFileField != null) {
    return blockedFileField;
  }
  const skillPii = filters?.skills?.pii;
  if (
    hasActivePiiPatterns(skillPii) &&
    (skillPii?.fields == null || skillPii.fields.includes('file_text'))
  ) {
    return 'content';
  }
  return null;
}

export function contentFilterUninspectableResponse(
  field: FileFilterField,
): UninspectableFileBlockResponse {
  return {
    error: 'content_filter_uninspectable',
    message: 'Submitted file content could not be inspected before processing.',
    source: 'file',
    field,
  };
}

export class UninspectableFileError extends Error {
  public readonly code = 'content_filter_uninspectable';
  public readonly statusCode = 400;
  public readonly body: UninspectableFileBlockResponse;

  constructor(field: FileFilterField) {
    const body = contentFilterUninspectableResponse(field);
    super(body.message);
    this.name = 'UninspectableFileError';
    this.body = body;
    Object.setPrototypeOf(this, UninspectableFileError.prototype);
  }
}

function hasSubmittedPayload(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.length > 0;
  }
  if (value == null || typeof value !== 'object') {
    return false;
  }
  let entries: [string, unknown][];
  try {
    entries = Object.entries(value);
  } catch {
    return false;
  }
  return entries.some(
    ([key, entryValue]) =>
      ['data', 'file_data', 'file_id', 'uri', 'url'].includes(key) &&
      typeof entryValue === 'string' &&
      entryValue.length > 0,
  );
}

function getObjectType(entries: readonly [string, unknown][]): string {
  const type = entries.find(([key]) => key === 'type')?.[1];
  return typeof type === 'string' ? type.toLowerCase() : '';
}

function isRemoteUri(value: string): boolean {
  return /^https?:\/\//i.test(value.trimStart());
}

function getDataUriFields(value: string): readonly FileFilterField[] {
  return value.trimStart().slice(5).toLowerCase().startsWith('audio/')
    ? AUDIO_FIELDS
    : CONTENT_FIELDS;
}

function getOpaqueFields(
  key: string,
  value: unknown,
  path: string,
  parentType: string,
): readonly FileFilterField[] | null {
  if (
    (key === 'file_ids' || key === 'vector_store_ids') &&
    Array.isArray(value) &&
    value.some((item) => typeof item === 'string' && item.length > 0)
  ) {
    return DERIVED_FILE_FIELDS;
  }
  if (key === 'file_id' && typeof value === 'string' && value.length > 0) {
    const pathLower = path.toLowerCase();
    if (
      parentType.includes('image') ||
      parentType.includes('video') ||
      pathLower.includes('/image_file/')
    ) {
      return CONTENT_FIELDS;
    }
    if (parentType.includes('audio')) {
      return AUDIO_FIELDS;
    }
    return DERIVED_FILE_FIELDS;
  }
  if (key === 'file_data' && hasSubmittedPayload(value)) {
    return DERIVED_FILE_FIELDS;
  }
  if (key === 'input_audio' && hasSubmittedPayload(value)) {
    return AUDIO_FIELDS;
  }
  if ((key === 'image_url' || key === 'video_url') && hasSubmittedPayload(value)) {
    return CONTENT_FIELDS;
  }
  if (key === 'audio_url' && hasSubmittedPayload(value)) {
    return AUDIO_FIELDS;
  }
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  if (isDataUri(value)) {
    return getDataUriFields(value);
  }

  const pathLower = path.toLowerCase();
  if (key === 'data') {
    if (parentType.includes('audio') || pathLower.includes('/input_audio/')) {
      return AUDIO_FIELDS;
    }
    if (
      parentType.includes('base64') ||
      parentType.includes('document') ||
      parentType.includes('file')
    ) {
      return DERIVED_FILE_FIELDS;
    }
    if (
      parentType.includes('image') ||
      parentType.includes('video') ||
      pathLower.includes('/image_url/') ||
      pathLower.includes('/video_url/')
    ) {
      return CONTENT_FIELDS;
    }
    if (isLikelyEncodedPayload(value, key, { type: parentType })) {
      return DERIVED_FILE_FIELDS;
    }
  }
  if (
    (key === 'uri' || key === 'filepath') &&
    (isRemoteUri(value) ||
      pathLower.includes('/attachments/') ||
      pathLower.includes('/files/') ||
      pathLower.includes('/image_file/'))
  ) {
    if (pathLower.includes('/image_file/')) {
      return CONTENT_FIELDS;
    }
    return DERIVED_FILE_FIELDS;
  }
  if (key === 'url' && isRemoteUri(value)) {
    if (parentType.includes('audio') || pathLower.includes('/audio_url/')) {
      return AUDIO_FIELDS;
    }
    if (
      parentType.includes('image') ||
      parentType.includes('video') ||
      parentType === 'url' ||
      pathLower.includes('/image_url/') ||
      pathLower.includes('/video_url/')
    ) {
      return parentType === 'url' ? DERIVED_FILE_FIELDS : CONTENT_FIELDS;
    }
  }
  return null;
}

/**
 * Returns the first configured file field whose submitted content is opaque.
 * Detection is skipped unless fail-close is enabled.
 */
export function getBlockedOpaqueFileField(
  filters: FiltersConfig | undefined,
  input: unknown,
): FileFilterField | null {
  if (getFilePii(filters)?.uninspectable !== 'block') {
    return null;
  }

  const pending: PendingOpaqueValue[] = [{ value: input, path: '', depth: 0 }];
  const seen = new WeakSet<object>();
  let visitedNodes = 0;
  let traversalTruncated = false;

  while (pending.length > 0 && visitedNodes < MAX_OPAQUE_NODES) {
    const current = pending.pop();
    if (current == null) {
      continue;
    }
    if (current.depth > MAX_OPAQUE_DEPTH) {
      traversalTruncated = true;
      continue;
    }
    visitedNodes++;

    if (typeof current.value === 'string') {
      if (isDataUri(current.value)) {
        const blockedField = getBlockedUninspectableFileField(
          filters,
          getDataUriFields(current.value),
        );
        if (blockedField != null) {
          return blockedField;
        }
      }
      continue;
    }
    if (current.value == null || typeof current.value !== 'object') {
      continue;
    }
    if (seen.has(current.value)) {
      continue;
    }
    seen.add(current.value);

    if (Array.isArray(current.value)) {
      if (current.depth >= MAX_OPAQUE_DEPTH && current.value.length > 0) {
        traversalTruncated = true;
        continue;
      }
      const availableNodes = Math.max(0, MAX_OPAQUE_NODES - visitedNodes - pending.length);
      const scheduledNodes = Math.min(current.value.length, availableNodes);
      if (scheduledNodes < current.value.length) {
        traversalTruncated = true;
      }
      try {
        for (let index = scheduledNodes - 1; index >= 0; index--) {
          pending.push({
            value: current.value[index],
            path: `${current.path}/${index}`,
            depth: current.depth + 1,
          });
        }
      } catch {
        traversalTruncated = true;
      }
      continue;
    }

    let entries: [string, unknown][];
    try {
      entries = Object.entries(current.value);
    } catch {
      traversalTruncated = true;
      continue;
    }
    if (current.depth >= MAX_OPAQUE_DEPTH && entries.length > 0) {
      traversalTruncated = true;
      continue;
    }
    const parentType = getObjectType(entries);
    const availableNodes = Math.max(0, MAX_OPAQUE_NODES - visitedNodes - pending.length);
    const scheduledNodes = Math.min(entries.length, availableNodes);
    if (scheduledNodes < entries.length) {
      traversalTruncated = true;
    }
    for (let index = scheduledNodes - 1; index >= 0; index--) {
      const [key, value] = entries[index];
      const path = `${current.path}/${escapeJsonPointer(key)}`;
      const fields = getOpaqueFields(key, value, path, parentType);
      if (fields != null) {
        const blockedField = getBlockedUninspectableFileField(filters, fields);
        if (blockedField != null) {
          return blockedField;
        }
      }
      pending.push({ value, path, depth: current.depth + 1 });
    }
  }

  if (pending.length > 0 || traversalTruncated) {
    return getBlockedUninspectableFileField(filters, DERIVED_FILE_FIELDS);
  }
  return null;
}

interface CanonicalReferenceTraversal {
  readonly fileIds: Set<string>;
  readonly incomplete: boolean;
}

function getCanonicalFileReferenceIds(input: unknown): CanonicalReferenceTraversal {
  if (input == null || typeof input !== 'object') {
    return { fileIds: new Set(), incomplete: false };
  }

  const fileIds = new Set<string>();
  const pending: Array<{ value: object; depth: number }> = [{ value: input, depth: 0 }];
  const seen = new WeakSet<object>();
  let visited = 0;
  let incomplete = false;

  while (pending.length > 0 && visited < MAX_OPAQUE_NODES) {
    const current = pending.pop();
    if (current == null || seen.has(current.value)) {
      continue;
    }
    if (current.depth > MAX_OPAQUE_DEPTH) {
      incomplete = true;
      continue;
    }
    seen.add(current.value);
    visited++;

    let entries: [string, unknown][];
    try {
      entries = Object.entries(current.value);
    } catch {
      incomplete = true;
      continue;
    }

    for (const [key, value] of entries) {
      if (key === 'file_id' && typeof value === 'string' && value.length > 0) {
        if (fileIds.size < MAX_OPAQUE_NODES || fileIds.has(value)) {
          fileIds.add(value);
        } else {
          incomplete = true;
        }
      } else if (key === 'file_ids' && Array.isArray(value)) {
        const remainingIds = Math.max(0, MAX_OPAQUE_NODES - fileIds.size);
        const inspectedIds = value.slice(0, remainingIds + 1);
        for (const fileId of inspectedIds) {
          if (typeof fileId === 'string' && fileId.length > 0) {
            if (fileIds.size < MAX_OPAQUE_NODES || fileIds.has(fileId)) {
              fileIds.add(fileId);
            } else {
              incomplete = true;
              break;
            }
          }
        }
        if (inspectedIds.length < value.length) {
          incomplete = true;
        }
        continue;
      }
      if (value != null && typeof value === 'object') {
        pending.push({ value, depth: current.depth + 1 });
      }
    }
  }

  return {
    fileIds,
    incomplete: incomplete || pending.length > 0,
  };
}

function getRequiredOpaqueFileField(
  filters: FiltersConfig | undefined,
): 'content' | 'extracted_text' | 'transcript' | null {
  const pii = getFilePii(filters);
  if (pii?.uninspectable !== 'block') {
    return null;
  }
  return (
    (['content', 'extracted_text', 'transcript'] as const).find(
      (field) => pii.fields == null || pii.fields.includes(field),
    ) ?? null
  );
}

function getNormalizedMimeType(file: CanonicalFileInspectionFile): string {
  if (typeof file.type !== 'string') {
    return '';
  }
  return file.type.split(';', 1)[0].trim().toLowerCase();
}

export function getCanonicalFileInspectionCoverage(
  file: CanonicalFileInspectionFile,
): CanonicalFileInspectionCoverage {
  const mimeType = getNormalizedMimeType(file);
  const isAudio = mimeType.startsWith('audio/');
  const isTextual = mimeType.startsWith('text/') || TEXTUAL_APPLICATION_MIME_TYPES.has(mimeType);
  const hasExtractedTextProvenance =
    typeof file.source === 'string' && file.source.toLowerCase() === 'text';
  const text = typeof file.text === 'string' ? file.text : undefined;
  const content = typeof file.content === 'string' ? file.content : undefined;
  const transcript = typeof file.transcript === 'string' ? file.transcript : undefined;

  return {
    content: content ?? (hasExtractedTextProvenance && isTextual ? text : undefined),
    extractedText: typeof file.extractedText === 'string' ? file.extractedText : text,
    transcript: transcript ?? (hasExtractedTextProvenance && isAudio ? text : undefined),
    transcriptApplicable: isAudio,
  };
}

function getMissingInspectableFileField(
  filters: FiltersConfig | undefined,
  file: CanonicalFileInspectionFile,
): 'content' | 'extracted_text' | 'transcript' | null {
  const pii = getFilePii(filters);
  if (pii?.uninspectable !== 'block') {
    return null;
  }
  const coverage = getCanonicalFileInspectionCoverage(file);
  const enabled = (field: FileFilterField) => pii.fields == null || pii.fields.includes(field);
  if (enabled('content') && coverage.content == null) {
    return 'content';
  }
  if (enabled('extracted_text') && coverage.extractedText == null) {
    return 'extracted_text';
  }
  if (enabled('transcript') && coverage.transcriptApplicable && coverage.transcript == null) {
    return 'transcript';
  }
  return null;
}

export function assertHydratedFileInspectable(
  filters: FiltersConfig | undefined,
  file: CanonicalFileInspectionFile,
): void {
  const missingField = getMissingInspectableFileField(filters, file);
  if (missingField != null) {
    throw new UninspectableFileError(missingField);
  }
}

function omitResolvedFileLocators(
  value: unknown,
  resolvedFileIds: ReadonlySet<string>,
  depth = 0,
  state?: {
    readonly seen: WeakMap<object, unknown>;
    visited: number;
  },
): unknown {
  if (value == null || typeof value !== 'object') {
    return value;
  }
  if (depth > MAX_OPAQUE_DEPTH) {
    return value;
  }

  const traversal = state ?? { seen: new WeakMap<object, unknown>(), visited: 0 };
  if (traversal.visited >= MAX_OPAQUE_NODES) {
    return value;
  }
  const seenValue = traversal.seen.get(value);
  if (seenValue !== undefined) {
    return seenValue;
  }
  traversal.visited++;

  if (Array.isArray(value)) {
    const cloned: unknown[] = [];
    traversal.seen.set(value, cloned);
    for (const item of value) {
      cloned.push(omitResolvedFileLocators(item, resolvedFileIds, depth + 1, traversal));
    }
    return cloned;
  }

  let entries: [string, unknown][];
  try {
    entries = Object.entries(value);
  } catch {
    return value;
  }

  const cloned: Record<string, unknown> = {};
  traversal.seen.set(value, cloned);
  const resolvedSingleFileId =
    typeof (value as { file_id?: unknown }).file_id === 'string' &&
    resolvedFileIds.has((value as { file_id: string }).file_id);

  for (const [key, child] of entries) {
    if (
      resolvedSingleFileId &&
      (key === 'file_id' || key === 'uri' || key === 'url' || key === 'filepath')
    ) {
      continue;
    }
    if (key === 'file_ids' && Array.isArray(child)) {
      const unresolvedFileIds = child.filter(
        (fileId) => typeof fileId !== 'string' || !resolvedFileIds.has(fileId),
      );
      if (unresolvedFileIds.length > 0) {
        cloned[key] = unresolvedFileIds;
      }
      continue;
    }
    cloned[key] = omitResolvedFileLocators(child, resolvedFileIds, depth + 1, traversal);
  }
  return cloned;
}

export function omitResolvedCanonicalFileLocators<T>(
  input: T,
  resolvedFileIds: ReadonlySet<string>,
): T {
  if (resolvedFileIds.size === 0) {
    return input;
  }
  return omitResolvedFileLocators(input, resolvedFileIds) as T;
}

export function allowHydratedFileReferences(
  filters: FiltersConfig | undefined,
): FiltersConfig | undefined {
  if (getFilePii(filters)?.uninspectable !== 'block') {
    return filters;
  }
  return {
    ...filters,
    files: {
      ...filters?.files,
      pii: {
        ...filters?.files?.pii,
        uninspectable: 'allow',
      },
    },
  };
}

/**
 * Resolves durable LibreChat file references against the authenticated owner
 * before fail-close checks run. Only locators backed by an owner-scoped file
 * row are removed from the inspection copy; unresolved IDs and unrelated
 * opaque payloads remain visible to `getBlockedOpaqueFileField`.
 */
export async function resolveCanonicalFileReferences<T>(
  input: CanonicalFileReferenceInspectionInput<T>,
): Promise<CanonicalFileReferenceInspection<T>> {
  const filters = input.filters;
  if (getFilePii(filters) == null) {
    return {
      sanitizedInput: input.input,
      hydratedFiles: [],
      hydratedFilters: filters,
    };
  }

  const references = getCanonicalFileReferenceIds(input.input);
  if (references.incomplete) {
    const blockedField = getRequiredOpaqueFileField(filters);
    if (blockedField != null) {
      throw new UninspectableFileError(blockedField);
    }
    throw new ContentTraversalLimitError();
  }

  const currentById = new Map<string, CanonicalFileInspectionFile>();
  const ownerId = input.user?.id;
  if (references.fileIds.size > 0 && ownerId) {
    const filter = {
      file_id: { $in: [...references.fileIds] },
      user: ownerId,
      ...(input.user?.tenantId != null && { tenantId: input.user.tenantId }),
    };
    try {
      const currentFiles = (await input.getFiles(filter, {}, {})) ?? [];
      for (const file of currentFiles) {
        if (typeof file?.file_id === 'string' && file.file_id.length > 0) {
          currentById.set(file.file_id, file);
        }
      }
    } catch {
      // An unavailable lookup is indistinguishable from an unresolved opaque
      // reference under fail-close. Compatibility mode leaves it unresolved.
    }
  }

  for (const file of input.liveFiles ?? []) {
    if (typeof file?.file_id === 'string' && !currentById.has(file.file_id)) {
      currentById.set(file.file_id, file);
    }
  }

  const requiredOpaqueField = getRequiredOpaqueFileField(filters);
  if (requiredOpaqueField != null) {
    for (const fileId of references.fileIds) {
      if (!currentById.has(fileId)) {
        throw new UninspectableFileError(requiredOpaqueField);
      }
    }
  }

  const hydratedFiles = [
    ...currentById.values(),
    ...(input.liveFiles ?? []).filter(
      (file) => typeof file?.file_id !== 'string' || file.file_id.length === 0,
    ),
  ];
  for (const file of hydratedFiles) {
    assertHydratedFileInspectable(filters, file);
  }

  const resolvedFileIds = new Set(currentById.keys());
  return {
    sanitizedInput:
      resolvedFileIds.size > 0
        ? omitResolvedCanonicalFileLocators(input.input, resolvedFileIds)
        : input.input,
    hydratedFiles,
    hydratedFilters: allowHydratedFileReferences(filters),
  };
}
