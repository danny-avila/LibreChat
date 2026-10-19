import { createHash } from 'crypto';
import { FileContext, getProjectFileAvailability } from 'librechat-data-provider';
import type { TChatProject, TChatProjectFile, TFile } from 'librechat-data-provider';
import type { IChatProject, ProjectFileRecord } from '@librechat/data-schemas';
import type { ProjectFileInput } from 'librechat-data-provider';
export type { ProjectFileRecord } from '@librechat/data-schemas';

export type CanonicalProjectResource = {
  file_id: string;
  identity: string;
  version: string;
} & ({ availability: 'ready'; file: TFile } | { availability: 'unavailable' });

/** Canonical lookup; metadata snapshots omit bodies, while active policy selects full records. */
export type GetProjectFiles = (options: {
  fileIds: string[];
  userId: string;
  tenantId?: string | null;
  includeContent?: boolean;
  codeExecution?: boolean;
}) => Promise<ReadonlyArray<ProjectFileRecord> | null>;

/** Owner and tenant scope are enforced by the canonical database lookup. */
export function getChatProjectFileAvailability(
  file: ProjectFileInput | null | undefined,
  codeExecution = false,
): 'ready' | 'unavailable' {
  return getProjectFileAvailability(file, codeExecution);
}

async function loadProjectFiles({
  project,
  userId,
  tenantId,
  getProjectFiles,
  includeContent = false,
  codeExecution = false,
}: {
  project: Pick<IChatProject, 'file_ids'> | Pick<TChatProject, 'file_ids'>;
  userId: string;
  tenantId?: string;
  getProjectFiles: GetProjectFiles;
  includeContent?: boolean;
  codeExecution?: boolean;
}): Promise<{ fileIds: string[]; byId: Map<string, ProjectFileRecord> }> {
  const fileIds = [
    ...new Set(
      (project.file_ids ?? []).filter((fileId): fileId is string => typeof fileId === 'string'),
    ),
  ];
  if (fileIds.length === 0) {
    return { fileIds, byId: new Map() };
  }
  const files = await getProjectFiles({
    fileIds,
    userId,
    tenantId,
    includeContent,
    codeExecution,
  });
  return { fileIds, byId: new Map((files ?? []).map((file) => [file.file_id, file])) };
}

function canonicalResourceVersion(
  file: ProjectFileRecord,
  identity: string,
  availability: 'ready' | 'unavailable',
): string {
  const isGenerated =
    file.context === FileContext.execute_code || file.context === FileContext.run_artifact;
  const dispatchedAt = isGenerated ? file.metadata?.sourceDispatchedAt : undefined;
  const contentTimestamp =
    dispatchedAt != null && Number.isFinite(dispatchedAt)
      ? new Date(dispatchedAt).toISOString()
      : (file.updatedAt?.toISOString() ?? null);
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
        updatedAt: contentTimestamp,
        previewRevision: isGenerated ? null : (file.previewRevision ?? null),
        status: isGenerated ? null : (file.status ?? null),
        bytes: file.bytes,
        filename: file.filename,
        type: file.type,
      }),
    )
    .digest('hex');
}

export function toCanonicalProjectResource(
  file: ProjectFileRecord,
  codeExecution = false,
): CanonicalProjectResource {
  if (file._id == null) {
    throw new Error('Project file identity unavailable');
  }
  const identity = file._id.toString();
  const availability = getChatProjectFileAvailability(file, codeExecution);
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
  getProjectFiles: GetProjectFiles;
  codeExecution?: boolean;
}): Promise<CanonicalProjectResource[]> {
  const { fileIds, byId } = await loadProjectFiles(params);
  return fileIds.map((fileId) => {
    const file = byId.get(fileId);
    return file == null
      ? { file_id: fileId, identity: 'missing', availability: 'unavailable', version: 'missing' }
      : toCanonicalProjectResource(file, params.codeExecution);
  });
}

export async function resolveChatProjectPolicyFiles(params: {
  project: Pick<IChatProject, 'file_ids'> | Pick<TChatProject, 'file_ids'>;
  userId: string;
  tenantId?: string;
  getProjectFiles: GetProjectFiles;
  codeExecution?: boolean;
}): Promise<ProjectFileRecord[]> {
  const { fileIds, byId } = await loadProjectFiles({ ...params, includeContent: true });
  return fileIds
    .map((fileId) => byId.get(fileId))
    .filter(
      (file): file is ProjectFileRecord =>
        getChatProjectFileAvailability(file, params.codeExecution) === 'ready',
    );
}

type RuntimeFileSource = {
  file_id: string;
  filename: string;
  filepath: string;
  object: 'file';
  type: string;
  bytes: number;
  usage: number;
  user: string | { toString(): string };
  tenantId?: string;
  embedded?: boolean;
  context?: string;
  source?: TFile['source'];
  storageKey?: string;
  storageRegion?: string;
  metadata?: TFile['metadata'];
};

export function toRuntimeFile(file: RuntimeFileSource): TFile {
  return {
    file_id: file.file_id,
    filename: file.filename,
    filepath: file.filepath,
    object: file.object,
    type: file.type,
    bytes: file.bytes,
    usage: file.usage,
    embedded: file.embedded === true,
    context: Object.values(FileContext).find((context) => context === file.context),
    user: typeof file.user === 'string' ? file.user : file.user.toString(),
    ...(file.tenantId != null ? { tenantId: file.tenantId } : {}),
    ...(file.source != null ? { source: file.source } : {}),
    ...(file.storageKey != null ? { storageKey: file.storageKey } : {}),
    ...(file.storageRegion != null ? { storageRegion: file.storageRegion } : {}),
    ...(file.metadata != null ? { metadata: structuredClone(file.metadata) } : {}),
  };
}

/**
 * Resolve resources for Agent runtime. Only currently eligible canonical files are returned,
 * deduplicated and with extracted text omitted. Callers must still intersect these files with
 * the selected Agent's already-enabled file tools.
 */
export async function resolveChatProjectFiles(params: {
  project: Pick<IChatProject, 'file_ids'> | Pick<TChatProject, 'file_ids'>;
  userId: string;
  tenantId?: string;
  getProjectFiles: GetProjectFiles;
  resources?: readonly CanonicalProjectResource[];
  codeExecution?: boolean;
}): Promise<TFile[]> {
  const resources =
    params.resources ??
    (await resolveChatProjectResources({
      project: params.project,
      userId: params.userId,
      tenantId: params.tenantId,
      getProjectFiles: params.getProjectFiles,
      codeExecution: params.codeExecution,
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
  getProjectFiles: GetProjectFiles;
  codeExecution?: boolean;
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
      availability: getChatProjectFileAvailability(file, params.codeExecution),
    };
  });
}
