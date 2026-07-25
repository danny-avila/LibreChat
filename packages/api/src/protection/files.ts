import { FILE_FILTER_FIELDS, hasActivePiiPatterns } from 'librechat-data-provider';
import type { FileFilterField, FiltersConfig } from 'librechat-data-provider';
import {
  ContentTraversalLimitError,
  escapeJsonPointer,
  getBoundedOwnEnumerableEntries,
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

interface MutableUnknownDictionary {
  [key: string]: unknown;
}

export interface CanonicalFileInspectionFile {
  readonly file_id?: string;
  readonly filename?: string;
  readonly filepath?: string;
  readonly uri?: string;
  readonly url?: string;
  readonly preview?: string;
  readonly type?: string;
  readonly source?: string;
  readonly content?: string | null;
  readonly extractedText?: string | null;
  readonly text?: string | null;
  readonly transcript?: string | null;
}

export interface CanonicalFileInspectionCoverage {
  readonly content?: string;
  readonly extractedText?: string;
  readonly transcript?: string;
  /** `null` means the MIME is absent or malformed, so strict transcript
   * policy must fail closed instead of assuming the file is non-audio. */
  readonly transcriptApplicable: boolean | null;
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
  /**
   * Server-derived runtime rows whose extraction fields belong to the exact
   * model-bound generation. Never populate this from request or resumable-job
   * metadata: a matching file_id alone is not an extraction attestation.
   */
  readonly trustedLiveFiles?: readonly CanonicalFileInspectionFile[];
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

/**
 * A file policy needs canonical file hydration only when it can inspect text
 * patterns or fail closed for one of the derived content surfaces.
 */
export function hasActiveFilePolicy(filters: FiltersConfig | undefined): boolean {
  const pii = getFilePii(filters);
  if (hasActivePiiPatterns(pii)) {
    return true;
  }
  return (
    pii?.uninspectable === 'block' &&
    DERIVED_FILE_FIELDS.some((field) => pii.fields == null || pii.fields.includes(field))
  );
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
  const boundedEntries = getBoundedOwnEnumerableEntries(value, 32);
  return (
    !boundedEntries.complete ||
    boundedEntries.entries.some(
      ([key, entryValue]) =>
        ['data', 'file_data', 'filedata', 'file_id', 'file_uri', 'fileuri', 'uri', 'url'].includes(
          key.toLowerCase(),
        ) &&
        typeof entryValue === 'string' &&
        entryValue.length > 0,
    )
  );
}

function getObjectType(entries: readonly [string, unknown][]): string {
  const type = entries.find(([key]) => key.toLowerCase() === 'type')?.[1];
  return typeof type === 'string' ? type.toLowerCase() : '';
}

function getObjectMimeType(entries: readonly [string, unknown][]): string {
  const explicitMimeType = entries.find(
    ([key]) => key.toLowerCase() === 'mimetype' || key.toLowerCase() === 'mime_type',
  )?.[1];
  const mimeType =
    explicitMimeType ??
    entries.find(
      ([key, entryValue]) =>
        key.toLowerCase() === 'type' && typeof entryValue === 'string' && entryValue.includes('/'),
    )?.[1];
  return typeof mimeType === 'string' ? mimeType.split(';', 1)[0].trim().toLowerCase() : '';
}

function getMediaFields(parentType: string, parentMimeType: string): readonly FileFilterField[] {
  if (parentType.includes('audio') || parentMimeType.startsWith('audio/')) {
    return AUDIO_FIELDS;
  }
  if (
    parentType.includes('image') ||
    parentType.includes('video') ||
    parentMimeType.startsWith('image/') ||
    parentMimeType.startsWith('video/')
  ) {
    return CONTENT_FIELDS;
  }
  return DERIVED_FILE_FIELDS;
}

function hasBoundedNonEmptyString(values: readonly unknown[]): boolean {
  const inspectedLength = Math.min(values.length, MAX_OPAQUE_NODES);
  try {
    for (let index = 0; index < inspectedLength; index++) {
      const value = values[index];
      if (typeof value === 'string' && value.length > 0) {
        return true;
      }
    }
  } catch {
    return true;
  }
  return inspectedLength < values.length;
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
  parentMimeType: string,
): readonly FileFilterField[] | null {
  const normalizedKey = key.toLowerCase();
  if (
    (normalizedKey === 'file_ids' || normalizedKey === 'vector_store_ids') &&
    Array.isArray(value) &&
    hasBoundedNonEmptyString(value)
  ) {
    return DERIVED_FILE_FIELDS;
  }
  if (normalizedKey === 'file_id' && typeof value === 'string' && value.length > 0) {
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
  if (
    (normalizedKey === 'file_data' || normalizedKey === 'filedata') &&
    hasSubmittedPayload(value)
  ) {
    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      const payloadEntries = getBoundedOwnEnumerableEntries(value, 32);
      if (payloadEntries.complete) {
        return getMediaFields(
          getObjectType(payloadEntries.entries),
          getObjectMimeType(payloadEntries.entries),
        );
      }
    }
    return DERIVED_FILE_FIELDS;
  }
  if (normalizedKey === 'document_url' && hasSubmittedPayload(value)) {
    return DERIVED_FILE_FIELDS;
  }
  if (normalizedKey === 'input_audio' && hasSubmittedPayload(value)) {
    return AUDIO_FIELDS;
  }
  if (
    (normalizedKey === 'image_url' || normalizedKey === 'video_url') &&
    hasSubmittedPayload(value)
  ) {
    return CONTENT_FIELDS;
  }
  if (normalizedKey === 'audio_url' && hasSubmittedPayload(value)) {
    return AUDIO_FIELDS;
  }
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  if (isDataUri(value)) {
    return getDataUriFields(value);
  }

  const pathLower = path.toLowerCase();
  if (normalizedKey === 'data') {
    if (parentType === 'media') {
      return getMediaFields(parentType, parentMimeType);
    }
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
    normalizedKey === 'fileuri' ||
    normalizedKey === 'file_uri' ||
    normalizedKey === 'document_url'
  ) {
    return getMediaFields(parentType, parentMimeType);
  }
  if (
    (normalizedKey === 'uri' || normalizedKey === 'filepath' || normalizedKey === 'preview') &&
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
  if (
    normalizedKey === 'url' &&
    (isRemoteUri(value) ||
      pathLower.includes('/attachments/') ||
      pathLower.includes('/files/') ||
      pathLower.includes('/image_file/'))
  ) {
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
    if (
      parentType.includes('file') ||
      parentType.includes('document') ||
      pathLower.includes('/attachments/') ||
      pathLower.includes('/files/')
    ) {
      return DERIVED_FILE_FIELDS;
    }
  }
  return null;
}

/**
 * Live runtime rows can carry extraction results that have not reached the
 * durable file record yet. They may supplement an owner-resolved row, but
 * never define its identity or canonical locators.
 */
function mergeOwnerResolvedFileMetadata(
  resolvedFile: CanonicalFileInspectionFile,
  liveFile: CanonicalFileInspectionFile,
): CanonicalFileInspectionFile {
  return {
    ...resolvedFile,
    ...(Object.prototype.hasOwnProperty.call(liveFile, 'content') && {
      content: liveFile.content,
    }),
    ...(Object.prototype.hasOwnProperty.call(liveFile, 'extractedText') && {
      extractedText: liveFile.extractedText,
    }),
    ...(Object.prototype.hasOwnProperty.call(liveFile, 'text') && {
      text: liveFile.text,
    }),
    ...(Object.prototype.hasOwnProperty.call(liveFile, 'transcript') && {
      transcript: liveFile.transcript,
    }),
  };
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

    const availableNodes = Math.max(0, MAX_OPAQUE_NODES - visitedNodes - pending.length);
    const boundedEntries = getBoundedOwnEnumerableEntries(current.value, availableNodes);
    const entries = boundedEntries.entries;
    if (!boundedEntries.complete) {
      traversalTruncated = true;
    }
    if (current.depth >= MAX_OPAQUE_DEPTH && entries.length > 0) {
      traversalTruncated = true;
      continue;
    }
    const parentType = getObjectType(entries);
    const parentMimeType = getObjectMimeType(entries);
    for (let index = entries.length - 1; index >= 0; index--) {
      const [key, value] = entries[index];
      const path = `${current.path}/${escapeJsonPointer(key)}`;
      const fields = getOpaqueFields(key, value, path, parentType, parentMimeType);
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
  readonly fileRelevantIncomplete: boolean;
}

function isLikelyFileReferenceContainer(key: string): boolean {
  return /(?:file|attach|document|audio|image|video|media|resource)/i.test(key);
}

function getCanonicalFileReferenceIds(input: unknown): CanonicalReferenceTraversal {
  if (input == null || typeof input !== 'object') {
    return { fileIds: new Set(), incomplete: false, fileRelevantIncomplete: false };
  }

  const fileIds = new Set<string>();
  const pending: Array<{ value: object; depth: number; fileRelevant: boolean }> = [
    { value: input, depth: 0, fileRelevant: false },
  ];
  const seen = new WeakSet<object>();
  let visited = 0;
  let incomplete = false;
  let fileRelevantIncomplete = false;
  const markIncomplete = (fileRelevant: boolean): void => {
    incomplete = true;
    if (fileRelevant) {
      fileRelevantIncomplete = true;
    }
  };

  while (pending.length > 0 && visited < MAX_OPAQUE_NODES) {
    const current = pending.pop();
    if (current == null || seen.has(current.value)) {
      continue;
    }
    if (current.depth > MAX_OPAQUE_DEPTH) {
      markIncomplete(current.fileRelevant);
      continue;
    }
    seen.add(current.value);
    visited++;

    const availableNodes = Math.max(0, MAX_OPAQUE_NODES - visited - pending.length);
    const boundedEntries = getBoundedOwnEnumerableEntries(current.value, availableNodes);
    const entries = boundedEntries.entries;
    if (!boundedEntries.complete) {
      markIncomplete(current.fileRelevant || current.depth === 0);
    }

    const ordinaryChildren: object[] = [];
    const fileChildren: object[] = [];
    for (const [key, value] of entries) {
      if (key === 'file_id' && typeof value === 'string' && value.length > 0) {
        if (fileIds.size < MAX_OPAQUE_NODES || fileIds.has(value)) {
          fileIds.add(value);
        } else {
          markIncomplete(true);
        }
      } else if (key === 'file_ids' && Array.isArray(value)) {
        const remainingIds = Math.max(0, MAX_OPAQUE_NODES - fileIds.size);
        const inspectedIds = value.slice(0, remainingIds + 1);
        for (const fileId of inspectedIds) {
          if (typeof fileId === 'string' && fileId.length > 0) {
            if (fileIds.size < MAX_OPAQUE_NODES || fileIds.has(fileId)) {
              fileIds.add(fileId);
            } else {
              markIncomplete(true);
              break;
            }
          }
        }
        if (inspectedIds.length < value.length) {
          markIncomplete(true);
        }
        continue;
      }
      if (value != null && typeof value === 'object') {
        (current.fileRelevant || isLikelyFileReferenceContainer(key)
          ? fileChildren
          : ordinaryChildren
        ).push(value);
      }
    }
    for (const value of ordinaryChildren) {
      pending.push({ value, depth: current.depth + 1, fileRelevant: false });
    }
    for (const value of fileChildren) {
      pending.push({ value, depth: current.depth + 1, fileRelevant: true });
    }
  }

  const pendingFileReference = pending.some(({ fileRelevant }) => fileRelevant);
  return {
    fileIds,
    incomplete: incomplete || pending.length > 0,
    fileRelevantIncomplete: fileRelevantIncomplete || pendingFileReference,
  };
}

function getActivePatternFileField(filters: FiltersConfig | undefined): FileFilterField | null {
  const pii = getFilePii(filters);
  if (!hasActivePiiPatterns(pii)) {
    return null;
  }
  return pii?.fields?.[0] ?? (pii?.fields == null ? FILE_FILTER_FIELDS[0] : null);
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
  const hasValidMimeShape = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(mimeType);
  const transcriptApplicable = hasValidMimeShape ? isAudio : null;
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
    transcriptApplicable,
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
  if (
    enabled('transcript') &&
    coverage.transcriptApplicable !== false &&
    coverage.transcript == null
  ) {
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
  resolvedFilesById: ReadonlyMap<string, CanonicalFileInspectionFile>,
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
    throw new ContentTraversalLimitError();
  }

  const traversal = state ?? { seen: new WeakMap<object, unknown>(), visited: 0 };
  if (traversal.visited >= MAX_OPAQUE_NODES) {
    throw new ContentTraversalLimitError();
  }
  const seenValue = traversal.seen.get(value);
  if (seenValue !== undefined) {
    return seenValue;
  }
  traversal.visited++;

  if (Array.isArray(value)) {
    const remainingNodes = MAX_OPAQUE_NODES - traversal.visited;
    if (value.length > remainingNodes) {
      throw new ContentTraversalLimitError();
    }
    const cloned: unknown[] = [];
    traversal.seen.set(value, cloned);
    for (const item of value) {
      cloned.push(omitResolvedFileLocators(item, resolvedFilesById, depth + 1, traversal));
    }
    return cloned;
  }

  const remainingNodes = MAX_OPAQUE_NODES - traversal.visited;
  const boundedEntries = getBoundedOwnEnumerableEntries(value, remainingNodes);
  if (!boundedEntries.complete) {
    throw new ContentTraversalLimitError();
  }
  const entries = boundedEntries.entries;

  const cloned: MutableUnknownDictionary = {};
  traversal.seen.set(value, cloned);
  const fileId = entries.find(([key]) => key === 'file_id')?.[1];
  const resolvedFile = typeof fileId === 'string' ? resolvedFilesById.get(fileId) : undefined;
  const matchesResolvedLocator = (locator: unknown): boolean => {
    if (typeof locator !== 'string' || resolvedFile == null) {
      return false;
    }
    return (
      resolvedFile.filepath === locator ||
      resolvedFile.uri === locator ||
      resolvedFile.url === locator ||
      resolvedFile.preview === locator
    );
  };

  for (const [key, child] of entries) {
    if (resolvedFile != null && key === 'file_id') {
      continue;
    }
    if (
      resolvedFile != null &&
      (key === 'uri' || key === 'url' || key === 'filepath' || key === 'preview') &&
      matchesResolvedLocator(child)
    ) {
      continue;
    }
    if (key === 'file_ids' && Array.isArray(child)) {
      if (child.length > MAX_OPAQUE_NODES - traversal.visited) {
        throw new ContentTraversalLimitError();
      }
      const unresolvedFileIds: unknown[] = [];
      for (const childFileId of child) {
        if (typeof childFileId !== 'string' || !resolvedFilesById.has(childFileId)) {
          unresolvedFileIds.push(childFileId);
        }
      }
      if (unresolvedFileIds.length > 0) {
        cloned[key] = unresolvedFileIds;
      }
      continue;
    }
    cloned[key] = omitResolvedFileLocators(child, resolvedFilesById, depth + 1, traversal);
  }
  return cloned;
}

export function omitResolvedCanonicalFileLocators<T>(
  input: T,
  resolvedFilesById: ReadonlyMap<string, CanonicalFileInspectionFile>,
): T {
  if (resolvedFilesById.size === 0) {
    return input;
  }
  return omitResolvedFileLocators(input, resolvedFilesById) as T;
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
  if (!hasActiveFilePolicy(filters)) {
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
  }
  if (references.fileRelevantIncomplete) {
    const patternField = getActivePatternFileField(filters);
    if (patternField != null) {
      throw new UninspectableFileError(patternField);
    }
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
        if (
          typeof file?.file_id === 'string' &&
          file.file_id.length > 0 &&
          references.fileIds.has(file.file_id)
        ) {
          currentById.set(file.file_id, file);
        }
      }
    } catch {
      // An unavailable lookup is indistinguishable from an unresolved opaque
      // reference under fail-close. Compatibility mode leaves it unresolved.
    }
  }

  for (const file of input.trustedLiveFiles ?? []) {
    if (typeof file?.file_id !== 'string' || file.file_id.length === 0) {
      continue;
    }
    const resolvedFile = currentById.get(file.file_id);
    if (resolvedFile != null) {
      currentById.set(file.file_id, mergeOwnerResolvedFileMetadata(resolvedFile, file));
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
    ...(input.trustedLiveFiles ?? []).filter(
      (file) => typeof file?.file_id !== 'string' || file.file_id.length === 0,
    ),
  ];
  for (const file of hydratedFiles) {
    assertHydratedFileInspectable(filters, file);
  }

  let sanitizedInput = input.input;
  if (currentById.size > 0) {
    try {
      sanitizedInput = omitResolvedCanonicalFileLocators(input.input, currentById);
    } catch (error) {
      if (!(error instanceof ContentTraversalLimitError)) {
        throw error;
      }
      /**
       * Canonical hydration is supplemental for pattern-only name/URI policy.
       * If an unrelated oversized subtree prevents cloning the whole request,
       * keep the original projection and inspect the owner-resolved rows
       * separately. Derived-content fail-close was handled above.
       */
    }
  }

  return {
    sanitizedInput,
    hydratedFiles,
    hydratedFilters: allowHydratedFileReferences(filters),
  };
}
