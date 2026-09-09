import { createHash } from 'crypto';
import { FileContext } from 'librechat-data-provider';
import type { TChatProject, TChatProjectFile, TFile } from 'librechat-data-provider';
import type { IChatProject, IMongoFile } from '@librechat/data-schemas';
import type { FilterQuery, SortOrder } from 'mongoose';

export type ProjectFileRecord = Pick<
  IMongoFile,
  | '_id'
  | 'file_id'
  | 'filename'
  | 'filepath'
  | 'object'
  | 'type'
  | 'bytes'
  | 'usage'
  | 'embedded'
  | 'context'
  | 'expiredAt'
  | 'user'
  | 'tenantId'
  | 'createdAt'
  | 'updatedAt'
  | 'previewRevision'
  | 'status'
  | 'text'
>;

export type CanonicalProjectResource = {
  file_id: string;
  identity: string;
  version: string;
} & ({ availability: 'ready'; file: TFile } | { availability: 'unavailable' });

/** Canonical lookup; metadata snapshots omit bodies, while active policy selects full records. */
export type GetProjectFiles = (
  filter: FilterQuery<IMongoFile>,
  sortOptions?: Record<string, SortOrder> | null,
  selectFields?: Record<string, 0 | 1> | string | null,
) => Promise<ReadonlyArray<ProjectFileRecord> | null>;

/** Project resources are restricted to owner-scoped, unscoped message attachments. */
export function getChatProjectFileAvailability(
  file: Pick<IMongoFile, 'embedded' | 'context' | 'expiredAt'> | null | undefined,
): 'ready' | 'unavailable' {
  if (!file || file.embedded !== true || file.context !== FileContext.message_attachment) {
    return 'unavailable';
  }

  if (file.expiredAt != null) {
    const expiry =
      file.expiredAt instanceof Date ? file.expiredAt.getTime() : Number(file.expiredAt);
    if (!Number.isFinite(expiry) || expiry <= Date.now()) {
      return 'unavailable';
    }
  }

  return 'ready';
}

async function loadProjectFiles({
  project,
  userId,
  tenantId,
  getFiles,
  includeContent = false,
}: {
  project: Pick<IChatProject, 'file_ids'> | Pick<TChatProject, 'file_ids'>;
  userId: string;
  tenantId?: string;
  getFiles: GetProjectFiles;
  includeContent?: boolean;
}): Promise<{ fileIds: string[]; byId: Map<string, ProjectFileRecord> }> {
  const fileIds = [
    ...new Set(
      (project.file_ids ?? []).filter((fileId): fileId is string => typeof fileId === 'string'),
    ),
  ];
  if (fileIds.length === 0) {
    return { fileIds, byId: new Map() };
  }

  const files = await getFiles(
    {
      file_id: { $in: fileIds },
      user: userId,
      embedded: true,
      context: FileContext.message_attachment,
      // Mongo's null predicate matches explicit null and legacy missing tenant fields.
      tenantId: tenantId != null && tenantId !== '' ? tenantId : null,
    },
    null,
    includeContent
      ? {}
      : {
          _id: 1,
          file_id: 1,
          filename: 1,
          filepath: 1,
          object: 1,
          type: 1,
          bytes: 1,
          usage: 1,
          embedded: 1,
          context: 1,
          expiredAt: 1,
          user: 1,
          tenantId: 1,
          createdAt: 1,
          updatedAt: 1,
          previewRevision: 1,
          status: 1,
        },
  );
  return { fileIds, byId: new Map((files ?? []).map((file) => [file.file_id, file])) };
}

function canonicalResourceVersion(
  file: ProjectFileRecord,
  identity: string,
  availability: 'ready' | 'unavailable',
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        identity,
        file_id: file.file_id,
        availability,
        embedded: file.embedded ?? null,
        context: file.context ?? null,
        expiredAt: file.expiredAt?.toISOString() ?? null,
        createdAt: file.createdAt?.toISOString() ?? null,
        updatedAt: file.updatedAt?.toISOString() ?? null,
        previewRevision: file.previewRevision ?? null,
        status: file.status ?? null,
        bytes: file.bytes,
        filename: file.filename,
        type: file.type,
      }),
    )
    .digest('hex');
}

export function toCanonicalProjectResource(file: ProjectFileRecord): CanonicalProjectResource {
  if (file._id == null) {
    throw new Error('Project file identity unavailable');
  }
  const identity = file._id.toString();
  const availability = getChatProjectFileAvailability(file);
  const version = canonicalResourceVersion(file, identity, availability);
  if (availability === 'ready') {
    return { file_id: file.file_id, identity, availability, version, file: toRuntimeFile(file) };
  }
  return { file_id: file.file_id, identity, availability, version };
}

export async function resolveChatProjectResources(params: {
  project: Pick<IChatProject, 'file_ids'> | Pick<TChatProject, 'file_ids'>;
  userId: string;
  tenantId?: string;
  getFiles: GetProjectFiles;
}): Promise<CanonicalProjectResource[]> {
  const { fileIds, byId } = await loadProjectFiles(params);
  return fileIds.map((fileId) => {
    const file = byId.get(fileId);
    return file == null
      ? { file_id: fileId, identity: 'missing', availability: 'unavailable', version: 'missing' }
      : toCanonicalProjectResource(file);
  });
}

export async function resolveChatProjectPolicyFiles(params: {
  project: Pick<IChatProject, 'file_ids'> | Pick<TChatProject, 'file_ids'>;
  userId: string;
  tenantId?: string;
  getFiles: GetProjectFiles;
}): Promise<ProjectFileRecord[]> {
  const { fileIds, byId } = await loadProjectFiles({ ...params, includeContent: true });
  return fileIds
    .map((fileId) => byId.get(fileId))
    .filter((file): file is ProjectFileRecord => getChatProjectFileAvailability(file) === 'ready');
}

export function toRuntimeFile(file: ProjectFileRecord): TFile {
  return {
    file_id: file.file_id,
    filename: file.filename,
    filepath: file.filepath,
    object: file.object,
    type: file.type,
    bytes: file.bytes,
    usage: file.usage,
    embedded: true,
    context: FileContext.message_attachment,
    user: typeof file.user === 'string' ? file.user : file.user.toString(),
    ...(file.tenantId != null ? { tenantId: file.tenantId } : {}),
  };
}

/**
 * Resolve resources for Agent runtime. Only currently eligible canonical files are returned,
 * deduplicated and with extracted text omitted. Callers must still intersect these files with
 * the selected Agent's already-enabled file-search capability.
 */
export async function resolveChatProjectFiles(params: {
  project: Pick<IChatProject, 'file_ids'> | Pick<TChatProject, 'file_ids'>;
  userId: string;
  tenantId?: string;
  getFiles: GetProjectFiles;
  resources?: readonly CanonicalProjectResource[];
}): Promise<TFile[]> {
  const resources =
    params.resources ??
    (await resolveChatProjectResources({
      project: params.project,
      userId: params.userId,
      tenantId: params.tenantId,
      getFiles: params.getFiles,
    }));
  const files: TFile[] = [];
  for (const resource of resources) {
    if (resource.availability === 'ready') {
      files.push(resource.file);
    }
  }
  return files;
}

/**
 * Build the HTTP-safe project file view. Unlike runtime resolution, this retains an unavailable
 * placeholder for every stored ID so deleted, expired, or otherwise ineligible references are
 * visible without disclosing another owner's metadata.
 */
export async function listChatProjectFileViews(params: {
  project: Pick<IChatProject, 'file_ids'> | Pick<TChatProject, 'file_ids'>;
  userId: string;
  tenantId?: string;
  getFiles: GetProjectFiles;
}): Promise<TChatProjectFile[]> {
  const { fileIds, byId } = await loadProjectFiles(params);
  return fileIds.map((file_id) => {
    const file = byId.get(file_id);
    return {
      file_id,
      ...(file
        ? {
            ...(typeof file.filename === 'string' ? { filename: file.filename } : {}),
            ...(typeof file.type === 'string' ? { type: file.type } : {}),
            ...(typeof file.bytes === 'number' ? { bytes: file.bytes } : {}),
          }
        : {}),
      availability: getChatProjectFileAvailability(file),
    };
  });
}
