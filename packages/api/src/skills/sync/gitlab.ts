import path from 'path';
import crypto from 'crypto';
import { Types } from 'mongoose';
import { logger, tenantStorage } from '@librechat/data-schemas';
import {
  ResourceType,
  PrincipalType,
  AccessRoleIds,
  SKILL_SYNC_DEFAULT_DISCOVERY_DEPTH,
} from 'librechat-data-provider';
import type {
  ISkill,
  ISkillFile,
  CreateSkillInput,
  UpdateSkillInput,
  CreateSkillResult,
  UpdateSkillResult,
  UpsertSkillFileInput,
  ISkillSyncStatus,
  SkillSyncProvider,
  SkillSyncCredentialSummary,
  SkillSyncStatusInput,
} from '@librechat/data-schemas';
import type { SkillSyncConfig, SkillSyncGitLabSourceConfig } from 'librechat-data-provider';
import type { RepoTreeEntry, RepoCommit } from './adapters/types';
import { RepoAdapterError } from './adapters/types';
import { createGitLabRepoAdapter, GITLAB_TOKEN_RECOMMENDATION } from './adapters/gitlab';
import { DEFAULT_SKILL_IMPORT_LIMITS } from '../limits';
import { parseSkillMarkdown } from '../parse';

const SYSTEM_AUTHOR_ID = new Types.ObjectId('000000000000000000000000');
const SYSTEM_AUTHOR_NAME = 'GitLab Sync';
const PROVIDER: SkillSyncProvider = 'gitlab';
const LOCK_LEASE_MS = 30 * 60 * 1000;

export { GITLAB_TOKEN_RECOMMENDATION };

type FetchFn = typeof fetch;

/**
 * `sha` here is the GitLab tree/blob `id` (opaque outside the adapter), kept
 * under this name to match `sourceMetadata.blobSha`/`skillBlobSha` written by
 * the shared discovery and skill-package-manifest logic mirrored from GitHub.
 */
type GitLabTreeEntryShape = {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
};

type GitLabCommitResponseShape = {
  sha: string;
  commit: { tree: { sha: string } };
};

type SyncCounters = {
  syncedSkillCount: number;
  syncedFileCount: number;
  deletedSkillCount: number;
  deletedFileCount: number;
};

type AssertNotCancelled = () => void;

type DiscoveredSkill = {
  rootPath: string;
  skillMd: GitLabTreeEntryShape;
  files: GitLabTreeEntryShape[];
};

type UpsertRemoteSkillResult = {
  skill: ISkill & { _id: Types.ObjectId };
  created: boolean;
};

type PreparedRemoteSkill = {
  existing: (ISkill & { _id: Types.ObjectId }) | null;
  update: UpdateSkillInput;
  createInput: CreateSkillInput;
};

type PreparedExistingRemoteSkill = PreparedRemoteSkill & {
  existing: ISkill & { _id: Types.ObjectId };
};

type PreparedDiscoveredSkill = {
  discovered: DiscoveredSkill;
  prepared: PreparedRemoteSkill;
};

type SaveBufferResult = {
  filepath: string;
  source: string;
  storageKey?: string;
  storageRegion?: string;
};

type StoredSkillFileRef = {
  filepath: string;
  source: string;
  storageKey?: string;
  storageRegion?: string;
  author?: Types.ObjectId | string;
  tenantId?: string;
};

type DeletedSyncedSkillJournal = {
  skill: ISkill & { _id: Types.ObjectId };
  files: Array<ISkillFile & { _id: Types.ObjectId }>;
};

type SyncSkillFilesJournal = {
  staleFiles: StoredSkillFileRef[];
  savedFiles: StoredSkillFileRef[];
};

type SyncSkillFilesResult = Pick<SyncCounters, 'syncedFileCount' | 'deletedFileCount'> &
  SyncSkillFilesJournal;

type MaybePromise<T> = T | Promise<T>;

export type GitLabSkillSyncDeps = {
  getConfig: () => MaybePromise<SkillSyncConfig | undefined>;
  getCredentialToken: (
    provider: SkillSyncProvider,
    credentialKey: string,
  ) => Promise<string | null>;
  getCredentialSummary: (
    provider: SkillSyncProvider,
    credentialKey: string,
  ) => Promise<SkillSyncCredentialSummary | null>;
  listCredentials: (provider: SkillSyncProvider) => Promise<SkillSyncCredentialSummary[]>;
  listStatuses: (provider: SkillSyncProvider) => Promise<ISkillSyncStatus[]>;
  upsertStatus: (input: SkillSyncStatusInput) => Promise<ISkillSyncStatus>;
  tryAcquireLock: (params: {
    provider: SkillSyncProvider;
    lockOwner: string;
    leaseMs: number;
    tenantId?: string;
  }) => Promise<boolean>;
  refreshLock: (params: {
    provider: SkillSyncProvider;
    lockOwner: string;
    leaseMs: number;
    tenantId?: string;
  }) => Promise<boolean>;
  releaseLock: (params: {
    provider: SkillSyncProvider;
    lockOwner: string;
    tenantId?: string;
  }) => Promise<void>;
  createSkill: (data: CreateSkillInput) => Promise<CreateSkillResult>;
  updateSkill: (params: {
    id: string;
    expectedVersion: number;
    update: UpdateSkillInput;
  }) => Promise<UpdateSkillResult>;
  getSkillById: (id: string | Types.ObjectId) => Promise<(ISkill & { _id: Types.ObjectId }) | null>;
  findSkillBySourceIdentity: (params: {
    source: 'github' | 'gitlab' | 'notion';
    upstreamId: string;
    tenantId?: string;
  }) => Promise<(ISkill & { _id: Types.ObjectId }) | null>;
  listSkillsBySource: (params: {
    source: 'github' | 'gitlab' | 'notion';
    sourceId: string;
  }) => Promise<Array<ISkill & { _id: Types.ObjectId }>>;
  listSkillFiles: (
    skillId: string | Types.ObjectId,
  ) => Promise<Array<ISkillFile & { _id: Types.ObjectId }>>;
  getSkillFileByPath: (
    skillId: string | Types.ObjectId,
    relativePath: string,
  ) => Promise<(ISkillFile & { _id: Types.ObjectId }) | null>;
  upsertSkillFile: (row: UpsertSkillFileInput) => Promise<ISkillFile & { _id: Types.ObjectId }>;
  deleteSkillFile: (
    skillId: string | Types.ObjectId,
    relativePath: string,
  ) => Promise<{ deleted: boolean }>;
  deleteSkill: (id: string) => Promise<{ deleted: boolean }>;
  saveBuffer: (params: {
    userId: string;
    buffer: Buffer;
    fileName: string;
    basePath?: string;
    isImage?: boolean;
    tenantId?: string;
  }) => Promise<SaveBufferResult>;
  deleteFile?: (file: {
    filepath: string;
    source: string;
    storageKey?: string;
    storageRegion?: string;
    user?: Types.ObjectId | string;
    tenantId?: string;
  }) => Promise<void>;
  grantPermission: (params: {
    principalType: string;
    principalId: string | Types.ObjectId | null;
    resourceType: string;
    resourceId: string | Types.ObjectId;
    accessRoleId: string;
    grantedBy: string | Types.ObjectId;
  }) => Promise<unknown>;
  fetchFn?: FetchFn;
  lockOwner?: string;
  allowServerCredentials?: boolean;
};

export type GitLabSkillSyncRunResult = {
  status: 'started' | 'skipped' | 'completed' | 'failed';
  message?: string;
  sources: Array<ISkillSyncStatus & { credentialPresent?: boolean }>;
};

export type GitLabSkillSyncStatus = {
  enabled: boolean;
  intervalMinutes: number;
  runOnStartup: boolean;
  sources: Array<ISkillSyncStatus & { credentialPresent: boolean }>;
  credentials: SkillSyncCredentialSummary[];
  fineGrainedTokenRecommendation: string;
};

export type GitLabSkillSyncRunner = {
  getStatus: () => Promise<GitLabSkillSyncStatus>;
  runOnce: () => Promise<GitLabSkillSyncRunResult>;
};

class SkillSyncError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'SkillSyncError';
    this.code = code;
  }
}

function normalizeRepoPath(value: string): string {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, '');
  return trimmed === '.' ? '' : trimmed;
}

function isSafeRelativePath(value: string): boolean {
  if (!value || value.startsWith('/') || value.startsWith('\\')) {
    return false;
  }
  if (!/^[a-zA-Z0-9._\-/]+$/.test(value)) {
    return false;
  }
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function makeUpstreamId(source: SkillSyncGitLabSourceConfig, rootPath: string): string {
  // Identity is keyed on the stable, admin-controlled source id and the skill's
  // root path only — never owner/repo/ref. Repointing a source to a renamed or
  // replacement repository (or rotating its ref) keeps the same upstream id, so
  // existing mirrors are updated in place instead of being treated as new and
  // colliding on the (name, author, tenantId) uniqueness constraint.
  return `${source.id}:${rootPath}`;
}

function makeSourceAuthorId(source: SkillSyncGitLabSourceConfig): Types.ObjectId {
  // Fold the tenant into the synthetic author so the same source mirrored into
  // different tenants gets distinct author ids (clearer audits, no cross-tenant
  // author collisions). The tenant suffix is omitted when absent so single-tenant
  // author ids stay stable.
  const seed = source.tenantId
    ? `${PROVIDER}:${source.id}:${source.tenantId}`
    : `${PROVIDER}:${source.id}`;
  const digest = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 24);
  return new Types.ObjectId(digest);
}

function toSkillName(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return normalized || 'gitlab-skill';
}

function getFilename(relativePath: string): string {
  return path.posix.basename(relativePath);
}

function guessMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.js': 'application/javascript',
    '.ts': 'text/typescript',
    '.jsx': 'text/jsx',
    '.tsx': 'text/tsx',
    '.json': 'application/json',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.py': 'text/x-python',
    '.sh': 'application/x-sh',
    '.css': 'text/css',
    '.html': 'text/html',
    '.xml': 'application/xml',
    '.csv': 'text/csv',
    '.toml': 'text/toml',
    '.ini': 'text/ini',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
  };
  return mimeMap[ext] ?? 'application/octet-stream';
}

function toCleanFrontmatter(
  frontmatter: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!frontmatter) {
    return {};
  }
  const clean = { ...frontmatter };
  delete clean.name;
  delete clean.description;
  // Drop a placeholder/non-boolean always-apply (e.g. `always-apply:` or
  // `always-apply: # TODO`, which js-yaml yields as null). Apply the same
  // cleanup to the accepted `alwaysApply` alias so a malformed alias does not
  // survive after the canonical key has already supplied the effective flag.
  // The boolean is already captured in the dedicated alwaysApply field, and
  // persisting a null here would leave ambiguous/invalid frontmatter on the
  // synced skill.
  if ('always-apply' in clean && typeof clean['always-apply'] !== 'boolean') {
    delete clean['always-apply'];
  }
  if ('alwaysApply' in clean && typeof clean.alwaysApply !== 'boolean') {
    delete clean.alwaysApply;
  }
  return clean;
}

function getLimitMegabytes(bytes: number): number {
  return Math.round(bytes / 1024 / 1024);
}

function assertGitLabBlobSize(entry: GitLabTreeEntryShape, relativePath: string): number {
  if (typeof entry.size !== 'number' || !Number.isFinite(entry.size) || entry.size < 0) {
    throw new SkillSyncError(
      'GITLAB_BLOB_SIZE_UNKNOWN',
      `GitLab file "${relativePath}" did not include a valid blob size`,
    );
  }
  if (entry.size > DEFAULT_SKILL_IMPORT_LIMITS.maxSingleFileBytes) {
    throw new SkillSyncError(
      'GITLAB_BLOB_TOO_LARGE',
      `GitLab file "${relativePath}" exceeds the ${getLimitMegabytes(
        DEFAULT_SKILL_IMPORT_LIMITS.maxSingleFileBytes,
      )}MB per-file skill import limit`,
    );
  }
  return entry.size;
}

function assertGitLabBufferSize(buffer: Buffer, relativePath: string): void {
  if (buffer.length <= DEFAULT_SKILL_IMPORT_LIMITS.maxSingleFileBytes) {
    return;
  }
  throw new SkillSyncError(
    'GITLAB_BLOB_TOO_LARGE',
    `GitLab file "${relativePath}" exceeds the ${getLimitMegabytes(
      DEFAULT_SKILL_IMPORT_LIMITS.maxSingleFileBytes,
    )}MB per-file skill import limit`,
  );
}

function assertCumulativeGitLabFileSize(totalBytes: number): void {
  if (totalBytes <= DEFAULT_SKILL_IMPORT_LIMITS.maxDecompressedBytes) {
    return;
  }
  throw new SkillSyncError(
    'GITLAB_PACKAGE_TOO_LARGE',
    `GitLab skill files exceed the ${getLimitMegabytes(
      DEFAULT_SKILL_IMPORT_LIMITS.maxDecompressedBytes,
    )}MB cumulative skill import limit`,
  );
}

function assertGitLabEntryCount(discovered: DiscoveredSkill): void {
  const entryCount = discovered.files.length + 1;
  if (entryCount <= DEFAULT_SKILL_IMPORT_LIMITS.maxEntries) {
    return;
  }
  throw new SkillSyncError(
    'GITLAB_TOO_MANY_FILES',
    `GitLab skill "${discovered.rootPath}" exceeds the ${DEFAULT_SKILL_IMPORT_LIMITS.maxEntries} file skill import limit`,
  );
}

function getSkillMdPath(discovered: DiscoveredSkill): string {
  return discovered.rootPath ? `${discovered.rootPath}/SKILL.md` : 'SKILL.md';
}

function getDiscoveredRelativePath(
  discovered: DiscoveredSkill,
  entry: GitLabTreeEntryShape,
): string {
  const prefix = discovered.rootPath ? `${discovered.rootPath}/` : '';
  const normalized = normalizeRepoPath(entry.path);
  return prefix ? normalized.slice(prefix.length) : normalized;
}

function assertGitLabSkillPackageManifest(discovered: DiscoveredSkill): void {
  assertGitLabEntryCount(discovered);
  assertGitLabBlobSize(discovered.skillMd, getSkillMdPath(discovered));
  let totalFileBytes = 0;
  for (const entry of discovered.files) {
    const relativePath = getDiscoveredRelativePath(discovered, entry);
    if (!isSafeRelativePath(relativePath) || relativePath.toUpperCase() === 'SKILL.MD') {
      continue;
    }
    totalFileBytes += assertGitLabBlobSize(entry, relativePath);
    assertCumulativeGitLabFileSize(totalFileBytes);
  }
}

function getSourceMetadataString(
  row: { sourceMetadata?: Record<string, unknown> },
  key: string,
): string | undefined {
  const metadata = row.sourceMetadata;
  const value = metadata && typeof metadata === 'object' ? metadata[key] : undefined;
  return typeof value === 'string' ? value : undefined;
}

function serializeDate(date: Date): string {
  return date.toISOString();
}

function sanitizeError(error: unknown): { code: string; message: string } {
  if (error instanceof SkillSyncError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return {
      code: 'SYNC_FAILED',
      message: error.message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]'),
    };
  }
  return { code: 'SYNC_FAILED', message: 'Unknown skill sync failure' };
}

/**
 * Bridges the provider-agnostic `RepoAdapterError` thrown by adapters back into
 * the `SkillSyncError` this module's orchestration and tests already key on, so
 * extracting the REST transport into an adapter changes no observable error code.
 */
function toSkillSyncError(error: unknown): unknown {
  if (error instanceof RepoAdapterError) {
    return new SkillSyncError(error.code, error.message);
  }
  return error;
}

async function withAdapterErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw toSkillSyncError(error);
  }
}

function toGitLabTreeEntryShape(entry: RepoTreeEntry): GitLabTreeEntryShape {
  return { path: entry.path, type: entry.type, sha: entry.id, size: entry.size };
}

function makeAdapter(params: {
  fetchFn: FetchFn;
  token: string;
  source: SkillSyncGitLabSourceConfig;
}) {
  return createGitLabRepoAdapter({
    baseUrl: params.source.baseUrl,
    projectId: params.source.projectId,
    token: params.token,
    fetchFn: params.fetchFn,
  });
}

async function fetchCommit(params: {
  fetchFn: FetchFn;
  token: string;
  source: SkillSyncGitLabSourceConfig;
}): Promise<GitLabCommitResponseShape> {
  const adapter = makeAdapter(params);
  const commit = await withAdapterErrors(() => adapter.resolveCommit(params.source.ref));
  // GitLab has no separate tree object — `treeId` equals the commit id itself.
  return { sha: commit.id, commit: { tree: { sha: commit.treeId } } };
}

async function fetchConfiguredTreeEntries(params: {
  fetchFn: FetchFn;
  token: string;
  source: SkillSyncGitLabSourceConfig;
  rootTreeSha: string;
  assertNotCancelled: AssertNotCancelled;
}): Promise<GitLabTreeEntryShape[]> {
  const adapter = makeAdapter(params);
  const commit: RepoCommit = { id: params.rootTreeSha, treeId: params.rootTreeSha };
  const entriesByPath = new Map<string, GitLabTreeEntryShape>();
  for (const repoPath of params.source.paths) {
    const entries = await withAdapterErrors(() =>
      adapter.fetchTreeEntries(commit, {
        ref: params.source.ref,
        pathPrefix: repoPath,
        assertNotCancelled: params.assertNotCancelled,
      }),
    );
    for (const entry of entries) {
      const normalizedPath = normalizeRepoPath(entry.path);
      entriesByPath.set(normalizedPath, toGitLabTreeEntryShape({ ...entry, path: normalizedPath }));
    }
  }
  return [...entriesByPath.values()];
}

async function fetchBlob(params: {
  fetchFn: FetchFn;
  token: string;
  source: SkillSyncGitLabSourceConfig;
  sha: string;
  ref: string;
}): Promise<Buffer> {
  const adapter = makeAdapter(params);
  return withAdapterErrors(() =>
    adapter.fetchFileContent(
      { id: params.ref, treeId: params.ref },
      { ref: params.ref, entry: { path: '', type: 'blob', id: params.sha } },
    ),
  );
}

function isSkillRootWithinDiscoveryDepth(
  rootPath: string,
  basePath: string,
  maxDepth: number,
): boolean {
  if (rootPath === basePath) {
    return true;
  }
  if (basePath && !rootPath.startsWith(`${basePath}/`)) {
    return false;
  }
  const relative = basePath ? rootPath.slice(basePath.length).replace(/^\/+/, '') : rootPath;
  if (!relative) {
    return true;
  }
  return relative.split('/').length <= maxDepth;
}

function discoverSkills(
  tree: GitLabTreeEntryShape[],
  source: SkillSyncGitLabSourceConfig,
): DiscoveredSkill[] {
  const basePaths = source.paths.map(normalizeRepoPath);
  const skillDiscoveryDepth = source.skillDiscoveryDepth ?? SKILL_SYNC_DEFAULT_DISCOVERY_DEPTH;
  const skillMdByRoot = new Map<string, GitLabTreeEntryShape>();
  for (const entry of tree) {
    if (entry.type !== 'blob') {
      continue;
    }
    const normalized = normalizeRepoPath(entry.path);
    const basename = path.posix.basename(normalized);
    if (basename.toUpperCase() !== 'SKILL.MD') {
      continue;
    }
    const parent = normalizeRepoPath(path.posix.dirname(normalized));
    for (const basePath of basePaths) {
      if (isSkillRootWithinDiscoveryDepth(parent, basePath, skillDiscoveryDepth)) {
        skillMdByRoot.set(parent, entry);
      }
    }
  }

  const skillRoots = [...skillMdByRoot.keys()];
  return [...skillMdByRoot.entries()].map(([rootPath, skillMd]) => {
    const prefix = rootPath ? `${rootPath}/` : '';
    const childSkillRoots = skillRoots.filter((candidate) => {
      if (!candidate || candidate === rootPath) {
        return false;
      }
      return rootPath ? candidate.startsWith(`${rootPath}/`) : true;
    });
    const files = tree.filter((entry) => {
      if (entry.type !== 'blob') {
        return false;
      }
      const normalized = normalizeRepoPath(entry.path);
      if (!normalized.startsWith(prefix) || normalized === skillMd.path) {
        return false;
      }
      if (childSkillRoots.some((childRoot) => normalized.startsWith(`${childRoot}/`))) {
        return false;
      }
      const relativePath = prefix ? normalized.slice(prefix.length) : normalized;
      return isSafeRelativePath(relativePath) && relativePath.toUpperCase() !== 'SKILL.MD';
    });
    return { rootPath, skillMd, files };
  });
}

function assertConfiguredPathsExist(
  tree: GitLabTreeEntryShape[],
  source: SkillSyncGitLabSourceConfig,
): void {
  for (const configuredPath of source.paths.map(normalizeRepoPath)) {
    if (configuredPath === '') {
      continue;
    }
    const exists = tree.some((entry) => {
      const entryPath = normalizeRepoPath(entry.path);
      return entryPath === configuredPath || entryPath.startsWith(`${configuredPath}/`);
    });
    if (!exists) {
      throw new SkillSyncError(
        'GITLAB_PATH_NOT_FOUND',
        `Configured GitLab skill path "${configuredPath}" was not found`,
      );
    }
  }
}

function makeStatusInput(params: {
  source: SkillSyncGitLabSourceConfig;
  status: SkillSyncStatusInput['status'];
  startedAt?: Date;
  finishedAt?: Date;
  errorCode?: string;
  errorMessage?: string;
  counts?: Partial<SyncCounters>;
}): SkillSyncStatusInput {
  return {
    provider: PROVIDER,
    sourceId: params.source.id,
    tenantId: params.source.tenantId,
    status: params.status,
    credentialKey: params.source.credentialKey,
    baseUrl: params.source.baseUrl,
    projectId: params.source.projectId,
    ref: params.source.ref,
    paths: params.source.paths,
    startedAt: params.startedAt,
    finishedAt: params.finishedAt,
    errorCode: params.errorCode,
    errorMessage: params.errorMessage,
    syncedSkillCount: params.counts?.syncedSkillCount ?? 0,
    syncedFileCount: params.counts?.syncedFileCount ?? 0,
    deletedSkillCount: params.counts?.deletedSkillCount ?? 0,
    deletedFileCount: params.counts?.deletedFileCount ?? 0,
  };
}

function makeStatusKey(sourceId: string, tenantId?: string): string {
  return `${tenantId ?? ''}:${sourceId}`;
}

async function ensurePublicViewer(
  deps: GitLabSkillSyncDeps,
  skillId: Types.ObjectId,
): Promise<void> {
  await deps.grantPermission({
    principalType: PrincipalType.PUBLIC,
    principalId: null,
    resourceType: ResourceType.SKILL,
    resourceId: skillId,
    accessRoleId: AccessRoleIds.SKILL_VIEWER,
    grantedBy: SYSTEM_AUTHOR_ID,
  });
}

async function prepareRemoteSkill(params: {
  deps: GitLabSkillSyncDeps;
  source: SkillSyncGitLabSourceConfig;
  discovered: DiscoveredSkill;
  skillMdContent: string;
  commitSha: string;
  syncedAt: Date;
}): Promise<PreparedRemoteSkill> {
  const { deps, source, discovered, skillMdContent, commitSha, syncedAt } = params;
  const parsed = parseSkillMarkdown(skillMdContent);
  if (parsed.parseError) {
    throw new SkillSyncError(
      'SKILL_PARSE_FAILED',
      `${discovered.rootPath}/SKILL.md contains invalid YAML frontmatter: ${parsed.parseError}`,
    );
  }
  if (parsed.invalidBooleans.length > 0) {
    throw new SkillSyncError(
      'SKILL_PARSE_FAILED',
      `${discovered.rootPath}/SKILL.md contains invalid boolean frontmatter`,
    );
  }
  const upstreamId = makeUpstreamId(source, discovered.rootPath);
  const fallbackName = toSkillName(path.posix.basename(discovered.rootPath) || source.id);
  const sourceMetadata = {
    provider: PROVIDER,
    sourceId: source.id,
    upstreamId,
    baseUrl: source.baseUrl,
    projectId: source.projectId,
    ref: source.ref,
    skillPath: discovered.rootPath,
    commitSha,
    skillBlobSha: discovered.skillMd.sha,
    syncedAt: serializeDate(syncedAt),
    syncStatus: 'synced',
  };
  const update: UpdateSkillInput = {
    name: parsed.name || fallbackName,
    description: parsed.description || parsed.name || fallbackName,
    body: skillMdContent,
    frontmatter: toCleanFrontmatter(parsed.frontmatter),
    alwaysApply: parsed.alwaysApply,
    source: PROVIDER,
    sourceMetadata,
  };
  const sourceTenantId = source.tenantId ?? undefined;
  const foundExisting = await deps.findSkillBySourceIdentity({
    source: PROVIDER,
    upstreamId,
    tenantId: sourceTenantId,
  });
  const existing =
    foundExisting && (foundExisting.tenantId ?? undefined) === sourceTenantId
      ? foundExisting
      : null;
  const createInput: CreateSkillInput = {
    ...(update as Omit<UpdateSkillInput, 'source'>),
    name: update.name ?? fallbackName,
    description: update.description ?? fallbackName,
    author: makeSourceAuthorId(source),
    authorName: SYSTEM_AUTHOR_NAME,
    source: PROVIDER,
    tenantId: source.tenantId,
  };
  return { existing, update, createInput };
}

async function commitRemoteSkill(
  deps: GitLabSkillSyncDeps,
  prepared: PreparedRemoteSkill,
): Promise<UpsertRemoteSkillResult> {
  if (prepared.existing) {
    const result = await deps.updateSkill({
      id: prepared.existing._id.toString(),
      expectedVersion: prepared.existing.version,
      update: prepared.update,
    });
    if (result.status === 'updated') {
      return { skill: result.skill, created: false };
    }
    if (result.status === 'conflict') {
      throw new SkillSyncError(
        'SKILL_CONFLICT',
        `Skill "${prepared.existing.name}" changed during sync`,
      );
    }
    throw new SkillSyncError(
      'SKILL_NOT_FOUND',
      `Previously synced skill "${prepared.existing.name}" was removed`,
    );
  }
  const created = await deps.createSkill(prepared.createInput);
  return { skill: created.skill, created: true };
}

/**
 * File sync bumps the parent skill's `version` (via file upserts/deletes) but
 * never changes its authored content, so we must re-read to get past our own
 * version bumps. A plain re-read would also silently accept and overwrite a
 * concurrent external edit; compare the refreshed content against the pre-sync
 * snapshot and treat a changed body/name/description/always-apply as a conflict.
 */
function hasExternalSkillEdit(before: ISkill, after: ISkill): boolean {
  return (
    before.body !== after.body ||
    before.name !== after.name ||
    before.description !== after.description ||
    (before.alwaysApply ?? false) !== (after.alwaysApply ?? false) ||
    JSON.stringify(before.frontmatter ?? {}) !== JSON.stringify(after.frontmatter ?? {})
  );
}

async function commitExistingRemoteSkillAfterFileSync(
  deps: GitLabSkillSyncDeps,
  prepared: PreparedExistingRemoteSkill,
  options: { forceCommit?: boolean } = {},
): Promise<UpsertRemoteSkillResult> {
  const refreshed = await deps.getSkillById(prepared.existing._id);
  if (!refreshed) {
    throw new SkillSyncError(
      'SKILL_NOT_FOUND',
      `Previously synced skill "${prepared.existing.name}" was removed`,
    );
  }
  if (hasExternalSkillEdit(prepared.existing, refreshed)) {
    throw new SkillSyncError(
      'SKILL_CONFLICT',
      `Skill "${prepared.existing.name}" was modified during sync`,
    );
  }
  if (!options.forceCommit && !hasRemoteSkillDefinitionChanged(prepared.update, refreshed)) {
    return { skill: refreshed, created: false };
  }
  return commitRemoteSkill(deps, { ...prepared, existing: refreshed });
}

async function cleanupFile(deps: GitLabSkillSyncDeps, file: StoredSkillFileRef): Promise<void> {
  if (!deps.deleteFile) {
    return;
  }
  await deps.deleteFile({
    filepath: file.filepath,
    source: file.source,
    storageKey: file.storageKey,
    storageRegion: file.storageRegion,
    user: file.author,
    tenantId: file.tenantId,
  });
}

function toStoredFileRef(params: {
  saved: SaveBufferResult;
  author: Types.ObjectId;
  tenantId?: string;
}): StoredSkillFileRef {
  return {
    filepath: params.saved.filepath,
    source: params.saved.source,
    storageKey: params.saved.storageKey,
    storageRegion: params.saved.storageRegion,
    author: params.author,
    tenantId: params.tenantId,
  };
}

function toSkillFileInput(file: ISkillFile & { _id: Types.ObjectId }): UpsertSkillFileInput {
  return {
    skillId: file.skillId,
    relativePath: file.relativePath,
    file_id: file.file_id,
    filename: file.filename,
    filepath: file.filepath,
    storageKey: file.storageKey,
    storageRegion: file.storageRegion,
    source: file.source,
    sourceMetadata: file.sourceMetadata,
    mimeType: file.mimeType,
    bytes: file.bytes,
    isExecutable: file.isExecutable,
    author: file.author,
    tenantId: file.tenantId,
  };
}

function toCreateSkillInput(skill: ISkill & { _id: Types.ObjectId }): CreateSkillInput {
  return {
    name: skill.name,
    displayTitle: skill.displayTitle,
    description: skill.description,
    body: skill.body,
    frontmatter: skill.frontmatter,
    category: skill.category,
    author: skill.author,
    authorName: skill.authorName,
    source: PROVIDER,
    sourceMetadata: skill.sourceMetadata,
    alwaysApply: skill.alwaysApply,
    tenantId: skill.tenantId,
  };
}

function toStoredFileRefFromSkillFile(
  file: ISkillFile & { _id: Types.ObjectId },
): StoredSkillFileRef {
  return {
    filepath: file.filepath,
    source: file.source,
    storageKey: file.storageKey,
    storageRegion: file.storageRegion,
    author: file.author,
    tenantId: file.tenantId,
  };
}

function getStoredFileKey(file: StoredSkillFileRef): string {
  return [file.source, file.filepath, file.storageKey ?? '', file.storageRegion ?? ''].join(':');
}

async function cleanupStoredFiles(params: {
  deps: GitLabSkillSyncDeps;
  files: StoredSkillFileRef[];
  logMessage: string;
}): Promise<void> {
  const seen = new Set<string>();
  for (const file of params.files) {
    const key = getStoredFileKey(file);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    await cleanupFile(params.deps, file).catch((cleanupError) =>
      logger.error(params.logMessage, cleanupError),
    );
  }
}

async function restoreExistingSkillFiles(params: {
  deps: GitLabSkillSyncDeps;
  skill: ISkill & { _id: Types.ObjectId };
  previousFiles: Array<ISkillFile & { _id: Types.ObjectId }>;
  savedFiles: StoredSkillFileRef[];
}): Promise<void> {
  const { deps, skill, previousFiles, savedFiles } = params;
  const previousByPath = new Map(previousFiles.map((file) => [file.relativePath, file]));
  const currentFiles = await deps.listSkillFiles(skill._id);

  for (const file of currentFiles) {
    if (previousByPath.has(file.relativePath)) {
      continue;
    }
    await deps.deleteSkillFile(skill._id, file.relativePath);
  }
  for (const file of previousFiles) {
    await deps.upsertSkillFile(toSkillFileInput(file));
  }
  await cleanupStoredFiles({
    deps,
    files: savedFiles,
    logMessage: '[GitLabSkillSync] Failed to clean up rolled-back synced file:',
  });
}

async function deleteSyncedSkillForRestore(
  deps: GitLabSkillSyncDeps,
  skill: ISkill & { _id: Types.ObjectId },
): Promise<{ deletedFileCount: number; deletedSkill: DeletedSyncedSkillJournal }> {
  const files = await deps.listSkillFiles(skill._id);
  await deps.deleteSkill(skill._id.toString());
  return {
    deletedFileCount: files.length,
    deletedSkill: { skill, files },
  };
}

async function restoreDeletedSyncedSkill(
  deps: GitLabSkillSyncDeps,
  deleted: DeletedSyncedSkillJournal,
): Promise<void> {
  const restored = await deps.createSkill(toCreateSkillInput(deleted.skill));
  for (const file of deleted.files) {
    await deps.upsertSkillFile({
      ...toSkillFileInput(file),
      skillId: restored.skill._id,
    });
  }
  await ensurePublicViewer(deps, restored.skill._id);
}

async function cleanupDeletedSyncedSkillFiles(
  deps: GitLabSkillSyncDeps,
  deleted: DeletedSyncedSkillJournal,
): Promise<void> {
  await cleanupStoredFiles({
    deps,
    files: deleted.files.map(toStoredFileRefFromSkillFile),
    logMessage: '[GitLabSkillSync] Failed to clean up deleted stale mirrored skill file:',
  });
}

function comparableSourceMetadata(metadata: Record<string, unknown> | undefined): string {
  const { commitSha: _commitSha, syncedAt: _syncedAt, ...rest } = metadata ?? {};
  return JSON.stringify(rest);
}

function hasRemoteSkillDefinitionChanged(update: UpdateSkillInput, existing: ISkill): boolean {
  return (
    update.body !== existing.body ||
    update.name !== existing.name ||
    update.description !== existing.description ||
    (update.alwaysApply ?? false) !== (existing.alwaysApply ?? false) ||
    JSON.stringify(update.frontmatter ?? {}) !== JSON.stringify(existing.frontmatter ?? {}) ||
    comparableSourceMetadata(update.sourceMetadata) !==
      comparableSourceMetadata(existing.sourceMetadata)
  );
}

function findMovedSourceSkill(params: {
  source: SkillSyncGitLabSourceConfig;
  prepared: PreparedRemoteSkill;
  existingSyncedSkills: Array<ISkill & { _id: Types.ObjectId }>;
  excludedUpstreamIds: Set<string>;
}): (ISkill & { _id: Types.ObjectId }) | null {
  const sourceTenantId = params.source.tenantId ?? undefined;
  const sourceAuthor = params.prepared.createInput.author.toString();
  const name = params.prepared.createInput.name;

  return (
    params.existingSyncedSkills.find((skill) => {
      if ((skill.tenantId ?? undefined) !== sourceTenantId) {
        return false;
      }
      if (skill.name !== name || skill.author.toString() !== sourceAuthor) {
        return false;
      }
      const upstreamId = getSourceMetadataString(skill, 'upstreamId');
      if (!upstreamId) {
        return false;
      }
      return !params.excludedUpstreamIds.has(upstreamId);
    }) ?? null
  );
}

function hasNameConflictingStaleSkill(params: {
  source: SkillSyncGitLabSourceConfig;
  prepared: PreparedDiscoveredSkill;
  existingSyncedSkills: Array<ISkill & { _id: Types.ObjectId }>;
  discoveredUpstreamIds: Set<string>;
}): boolean {
  return Boolean(
    findMovedSourceSkill({
      source: params.source,
      prepared: params.prepared.prepared,
      existingSyncedSkills: params.existingSyncedSkills,
      excludedUpstreamIds: params.discoveredUpstreamIds,
    }),
  );
}

function orderPreparedSkillsForSafeStaleDeletes(params: {
  source: SkillSyncGitLabSourceConfig;
  preparedSkills: PreparedDiscoveredSkill[];
  existingSyncedSkills: Array<ISkill & { _id: Types.ObjectId }>;
  discoveredUpstreamIds: Set<string>;
}): PreparedDiscoveredSkill[] {
  const regular: PreparedDiscoveredSkill[] = [];
  const nameConflicting: PreparedDiscoveredSkill[] = [];
  for (const prepared of params.preparedSkills) {
    if (
      prepared.prepared.existing &&
      hasNameConflictingStaleSkill({
        source: params.source,
        prepared,
        existingSyncedSkills: params.existingSyncedSkills,
        discoveredUpstreamIds: params.discoveredUpstreamIds,
      })
    ) {
      nameConflicting.push(prepared);
      continue;
    }
    regular.push(prepared);
  }
  return [...regular, ...nameConflicting];
}

function getMirrorNameKey(params: {
  tenantId?: string;
  author: string;
  name: string | undefined;
}): string {
  return `${params.tenantId ?? ''}:${params.author}:${params.name ?? ''}`;
}

function assertNoDuplicatePreparedSkillNames(
  source: SkillSyncGitLabSourceConfig,
  preparedSkills: PreparedDiscoveredSkill[],
): void {
  const sourceTenantId = source.tenantId ?? undefined;
  const seen = new Map<string, string>();
  for (const { discovered, prepared } of preparedSkills) {
    const key = getMirrorNameKey({
      tenantId: sourceTenantId,
      author: prepared.createInput.author.toString(),
      name: prepared.createInput.name,
    });
    if (seen.has(key)) {
      throw new SkillSyncError(
        'DUPLICATE_SKILL_NAME',
        `GitLab source "${source.id}" contains multiple skills named "${prepared.createInput.name}"`,
      );
    }
    seen.set(key, discovered.rootPath);
  }
}

async function deleteNameConflictingStaleSkill(params: {
  deps: GitLabSkillSyncDeps;
  source: SkillSyncGitLabSourceConfig;
  prepared: PreparedRemoteSkill;
  existingSyncedSkills: Array<ISkill & { _id: Types.ObjectId }>;
  discoveredUpstreamIds: Set<string>;
  assertNotCancelled: AssertNotCancelled;
}): Promise<{
  remainingSkills: Array<ISkill & { _id: Types.ObjectId }>;
  deletedSkillCount: number;
  deletedFileCount: number;
  deletedSkill?: DeletedSyncedSkillJournal;
}> {
  const staleSkill = findMovedSourceSkill({
    source: params.source,
    prepared: params.prepared,
    existingSyncedSkills: params.existingSyncedSkills,
    excludedUpstreamIds: params.discoveredUpstreamIds,
  });
  if (!staleSkill) {
    return {
      remainingSkills: params.existingSyncedSkills,
      deletedSkillCount: 0,
      deletedFileCount: 0,
    };
  }

  params.assertNotCancelled();
  const { deletedFileCount, deletedSkill } = await deleteSyncedSkillForRestore(
    params.deps,
    staleSkill,
  );
  const staleSkillId = staleSkill._id.toString();

  return {
    remainingSkills: params.existingSyncedSkills.filter(
      (skill) => skill._id.toString() !== staleSkillId,
    ),
    deletedSkillCount: 1,
    deletedFileCount,
    deletedSkill,
  };
}

async function syncSkillFiles(params: {
  deps: GitLabSkillSyncDeps;
  token: string;
  source: SkillSyncGitLabSourceConfig;
  skill: ISkill & { _id: Types.ObjectId };
  discovered: DiscoveredSkill;
  commitSha: string;
  fetchFn: FetchFn;
  assertNotCancelled: AssertNotCancelled;
  journal?: SyncSkillFilesJournal;
}): Promise<SyncSkillFilesResult> {
  const { deps, token, source, skill, discovered, commitSha, fetchFn, assertNotCancelled } = params;
  const journal = params.journal ?? { staleFiles: [], savedFiles: [] };
  const remotePaths = new Set<string>();
  let syncedFileCount = 0;
  let deletedFileCount = 0;
  let totalFileBytes = 0;

  for (const entry of discovered.files) {
    assertNotCancelled();
    const relativePath = getDiscoveredRelativePath(discovered, entry);
    if (!isSafeRelativePath(relativePath) || relativePath.toUpperCase() === 'SKILL.MD') {
      continue;
    }
    totalFileBytes += assertGitLabBlobSize(entry, relativePath);
    assertCumulativeGitLabFileSize(totalFileBytes);
    remotePaths.add(relativePath);
    const existing = await deps.getSkillFileByPath(skill._id, relativePath);
    if (existing && getSourceMetadataString(existing, 'blobSha') === entry.sha) {
      continue;
    }
    const buffer = await fetchBlob({ fetchFn, token, source, sha: entry.sha, ref: source.ref });
    assertNotCancelled();
    assertGitLabBufferSize(buffer, relativePath);
    const fileId = crypto.randomUUID();
    const filename = getFilename(relativePath);
    const mimeType = guessMimeType(filename);
    const saved = await deps.saveBuffer({
      userId: skill.author.toString(),
      buffer,
      fileName: `${fileId}__${filename}`,
      basePath: 'uploads',
      isImage: mimeType.startsWith('image/'),
      tenantId: skill.tenantId,
    });
    const savedFile = toStoredFileRef({ saved, author: skill.author, tenantId: skill.tenantId });
    try {
      await deps.upsertSkillFile({
        skillId: skill._id,
        relativePath,
        file_id: fileId,
        filename,
        filepath: saved.filepath,
        storageKey: saved.storageKey,
        storageRegion: saved.storageRegion,
        source: saved.source,
        sourceMetadata: {
          provider: PROVIDER,
          sourceId: source.id,
          upstreamId: makeUpstreamId(source, discovered.rootPath),
          commitSha,
          blobSha: entry.sha,
          path: entry.path,
        },
        mimeType,
        bytes: buffer.length,
        isExecutable: false,
        author: skill.author,
        tenantId: skill.tenantId,
      });
    } catch (error) {
      await cleanupFile(deps, savedFile).catch((cleanupError) =>
        logger.error('[GitLabSkillSync] Failed to clean up orphaned synced file:', cleanupError),
      );
      throw error;
    }
    syncedFileCount++;
    journal.savedFiles.push(savedFile);
    if (existing && existing.filepath !== saved.filepath) {
      journal.staleFiles.push(existing);
    }
  }

  const existingFiles = await deps.listSkillFiles(skill._id);
  for (const file of existingFiles) {
    assertNotCancelled();
    if (remotePaths.has(file.relativePath)) {
      continue;
    }
    const result = await deps.deleteSkillFile(skill._id, file.relativePath);
    if (result.deleted) {
      deletedFileCount++;
      journal.staleFiles.push(file);
    }
  }
  return { syncedFileCount, deletedFileCount, ...journal };
}

async function deleteSyncedSkill(
  deps: GitLabSkillSyncDeps,
  skill: ISkill & { _id: Types.ObjectId },
): Promise<number> {
  const files = await deps.listSkillFiles(skill._id);
  let deletedFiles = 0;
  for (const file of files) {
    await cleanupFile(deps, file).catch((cleanupError) =>
      logger.error('[GitLabSkillSync] Failed to clean up mirrored skill file:', cleanupError),
    );
    deletedFiles++;
  }
  await deps.deleteSkill(skill._id.toString());
  return deletedFiles;
}

function getTokenEnvVarName(tokenReference: string | undefined): string | null {
  const match = tokenReference?.trim().match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/);
  return match?.[1] ?? null;
}

async function resolveGitLabToken(
  deps: GitLabSkillSyncDeps,
  source: SkillSyncGitLabSourceConfig,
): Promise<string | null> {
  if (deps.allowServerCredentials === false) {
    return null;
  }
  const tokenEnvVar = getTokenEnvVarName(source.token);
  if (tokenEnvVar) {
    return process.env[tokenEnvVar]?.trim() || null;
  }
  if (!source.credentialKey) {
    return null;
  }
  return deps.getCredentialToken(PROVIDER, source.credentialKey);
}

function getMissingCredentialMessage(
  source: SkillSyncGitLabSourceConfig,
  allowServerCredentials: boolean,
): string {
  if (!allowServerCredentials) {
    return 'Server GitLab credentials are not available for this skill sync config';
  }
  const tokenEnvVar = getTokenEnvVarName(source.token);
  if (tokenEnvVar) {
    return `Missing GitLab token environment variable "${tokenEnvVar}"`;
  }
  return `Missing GitLab credential "${source.credentialKey ?? source.id}"`;
}

async function syncSource(params: {
  deps: GitLabSkillSyncDeps;
  source: SkillSyncGitLabSourceConfig;
  fetchFn: FetchFn;
  assertNotCancelled: AssertNotCancelled;
}): Promise<ISkillSyncStatus> {
  const { deps, source, fetchFn, assertNotCancelled } = params;
  const startedAt = new Date();
  await deps.upsertStatus(makeStatusInput({ source, status: 'running', startedAt }));
  try {
    assertNotCancelled();
    const allowServerCredentials = deps.allowServerCredentials !== false;
    const token = await resolveGitLabToken(deps, source);
    assertNotCancelled();
    if (!token) {
      throw new SkillSyncError(
        'MISSING_CREDENTIAL',
        getMissingCredentialMessage(source, allowServerCredentials),
      );
    }
    const commit = await fetchCommit({ fetchFn, token, source });
    assertNotCancelled();
    const treeEntries = await fetchConfiguredTreeEntries({
      fetchFn,
      token,
      source,
      rootTreeSha: commit.commit.tree.sha,
      assertNotCancelled,
    });
    assertConfiguredPathsExist(treeEntries, source);
    const discoveredSkills = discoverSkills(treeEntries, source);
    const seenUpstreamIds = new Set<string>();
    let existingSyncedSkills: Array<ISkill & { _id: Types.ObjectId }> | null = null;
    const getExistingSyncedSkills = async () => {
      if (!existingSyncedSkills) {
        existingSyncedSkills = await deps.listSkillsBySource({
          source: PROVIDER,
          sourceId: source.id,
        });
      }
      return existingSyncedSkills;
    };
    const counts: SyncCounters = {
      syncedSkillCount: 0,
      syncedFileCount: 0,
      deletedSkillCount: 0,
      deletedFileCount: 0,
    };
    const syncedAt = new Date();
    const preparedSkills: PreparedDiscoveredSkill[] = [];

    for (const discovered of discoveredSkills) {
      assertNotCancelled();
      assertGitLabSkillPackageManifest(discovered);
      const skillMdPath = getSkillMdPath(discovered);
      const skillMdBuffer = await fetchBlob({
        fetchFn,
        token,
        source,
        sha: discovered.skillMd.sha,
        ref: source.ref,
      });
      assertNotCancelled();
      assertGitLabBufferSize(skillMdBuffer, skillMdPath);
      const prepared = await prepareRemoteSkill({
        deps,
        source,
        discovered,
        skillMdContent: skillMdBuffer.toString('utf-8'),
        commitSha: commit.sha,
        syncedAt,
      });
      preparedSkills.push({ discovered, prepared });
    }

    const discoveredUpstreamIds = new Set(
      preparedSkills.map(({ discovered }) => makeUpstreamId(source, discovered.rootPath)),
    );
    assertNoDuplicatePreparedSkillNames(source, preparedSkills);
    const orderedPreparedSkills = orderPreparedSkillsForSafeStaleDeletes({
      source,
      preparedSkills,
      existingSyncedSkills: await getExistingSyncedSkills(),
      discoveredUpstreamIds,
    });

    for (const { discovered, prepared } of orderedPreparedSkills) {
      assertNotCancelled();
      const movedExisting = prepared.existing
        ? null
        : findMovedSourceSkill({
            source,
            prepared,
            existingSyncedSkills: await getExistingSyncedSkills(),
            excludedUpstreamIds: discoveredUpstreamIds,
          });
      const effectivePrepared: PreparedRemoteSkill = movedExisting
        ? { ...prepared, existing: movedExisting }
        : prepared;
      seenUpstreamIds.add(makeUpstreamId(source, discovered.rootPath));
      if (effectivePrepared.existing) {
        // Check for an external edit before mutating files, so a concurrently
        // edited skill fails fast without leaving its bundled files partially
        // rewritten to the upstream version. The post-file-sync check below
        // still guards edits that land during the file sync itself.
        const beforeFileSync = await deps.getSkillById(effectivePrepared.existing._id);
        if (!beforeFileSync) {
          throw new SkillSyncError(
            'SKILL_NOT_FOUND',
            `Previously synced skill "${effectivePrepared.existing.name}" was removed`,
          );
        }
        if (hasExternalSkillEdit(effectivePrepared.existing, beforeFileSync)) {
          throw new SkillSyncError(
            'SKILL_CONFLICT',
            `Skill "${effectivePrepared.existing.name}" was modified during sync`,
          );
        }
        await ensurePublicViewer(deps, effectivePrepared.existing._id);
        const previousFiles = await deps.listSkillFiles(effectivePrepared.existing._id);
        const journal: SyncSkillFilesJournal = { staleFiles: [], savedFiles: [] };
        let fileCounts: SyncSkillFilesResult;
        let staleConflictCleanup:
          | Awaited<ReturnType<typeof deleteNameConflictingStaleSkill>>
          | undefined;
        try {
          fileCounts = await syncSkillFiles({
            deps,
            token,
            source,
            skill: effectivePrepared.existing,
            discovered,
            commitSha: commit.sha,
            fetchFn,
            assertNotCancelled,
            journal,
          });
          if (prepared.existing) {
            staleConflictCleanup = await deleteNameConflictingStaleSkill({
              deps,
              source,
              prepared: effectivePrepared,
              existingSyncedSkills: await getExistingSyncedSkills(),
              discoveredUpstreamIds,
              assertNotCancelled,
            });
            existingSyncedSkills = staleConflictCleanup.remainingSkills;
            counts.deletedSkillCount += staleConflictCleanup.deletedSkillCount;
            counts.deletedFileCount += staleConflictCleanup.deletedFileCount;
          }
          await commitExistingRemoteSkillAfterFileSync(
            deps,
            {
              ...effectivePrepared,
              existing: effectivePrepared.existing,
            },
            { forceCommit: fileCounts.syncedFileCount > 0 || fileCounts.deletedFileCount > 0 },
          );
        } catch (error) {
          await restoreExistingSkillFiles({
            deps,
            skill: effectivePrepared.existing,
            previousFiles,
            savedFiles: journal.savedFiles,
          }).catch((cleanupError) =>
            logger.error(
              '[GitLabSkillSync] Failed to restore existing skill files after sync failure:',
              cleanupError,
            ),
          );
          if (staleConflictCleanup?.deletedSkill) {
            await restoreDeletedSyncedSkill(deps, staleConflictCleanup.deletedSkill).catch(
              (cleanupError) =>
                logger.error(
                  '[GitLabSkillSync] Failed to restore stale mirrored skill after sync failure:',
                  cleanupError,
                ),
            );
          }
          throw error;
        }
        await cleanupStoredFiles({
          deps,
          files: fileCounts.staleFiles,
          logMessage: '[GitLabSkillSync] Failed to clean up replaced synced file:',
        });
        if (staleConflictCleanup?.deletedSkill) {
          await cleanupDeletedSyncedSkillFiles(deps, staleConflictCleanup.deletedSkill);
        }
        counts.syncedSkillCount++;
        counts.syncedFileCount += fileCounts.syncedFileCount;
        counts.deletedFileCount += fileCounts.deletedFileCount;
        continue;
      }

      const upserted = await commitRemoteSkill(deps, effectivePrepared);
      const { skill } = upserted;
      try {
        const fileCounts = await syncSkillFiles({
          deps,
          token,
          source,
          skill,
          discovered,
          commitSha: commit.sha,
          fetchFn,
          assertNotCancelled,
        });
        await ensurePublicViewer(deps, skill._id);
        counts.syncedSkillCount++;
        counts.syncedFileCount += fileCounts.syncedFileCount;
        counts.deletedFileCount += fileCounts.deletedFileCount;
      } catch (error) {
        await deleteSyncedSkill(deps, skill).catch((cleanupError) =>
          logger.error(
            '[GitLabSkillSync] Failed to roll back partially synced skill:',
            cleanupError,
          ),
        );
        throw error;
      }
    }

    const currentSyncedSkills = await deps.listSkillsBySource({
      source: PROVIDER,
      sourceId: source.id,
    });
    // Only mirror-delete skills owned by this source's tenant. With no
    // configured tenantId under non-strict isolation, listSkillsBySource can
    // return gitlab skills across tenants, so without this guard an ambient sync
    // could delete another tenant's mirrored skills. Absent tenantId is its own
    // (ambient) bucket.
    const sourceTenantId = source.tenantId ?? undefined;
    for (const skill of currentSyncedSkills) {
      assertNotCancelled();
      if ((skill.tenantId ?? undefined) !== sourceTenantId) {
        continue;
      }
      const upstreamId =
        skill.sourceMetadata && typeof skill.sourceMetadata.upstreamId === 'string'
          ? skill.sourceMetadata.upstreamId
          : '';
      if (seenUpstreamIds.has(upstreamId)) {
        continue;
      }
      counts.deletedFileCount += await deleteSyncedSkill(deps, skill);
      counts.deletedSkillCount++;
    }

    return deps.upsertStatus(
      makeStatusInput({
        source,
        status: 'succeeded',
        startedAt,
        finishedAt: new Date(),
        counts,
      }),
    );
  } catch (error) {
    const sanitized = sanitizeError(error);
    logger.error(`[GitLabSkillSync] Source "${source.id}" failed: ${sanitized.message}`);
    return deps.upsertStatus(
      makeStatusInput({
        source,
        status: 'failed',
        startedAt,
        finishedAt: new Date(),
        errorCode: sanitized.code,
        errorMessage: sanitized.message,
      }),
    );
  }
}

/**
 * Runs a source sync inside its tenant's async context when `tenantId` is set,
 * so the tenant-isolation mongoose hooks scope every skill/file/ACL read and
 * write to that tenant (required under strict isolation). Storage writes also
 * receive the tenant explicitly via `skill.tenantId`. Without a configured
 * tenant the sync runs in the ambient context, preserving single-tenant behavior.
 *
 * The callback is `async` per the tenant-context contract so the ALS store
 * propagates across every awaited Mongoose operation in `syncSource`.
 */
function syncSourceInTenantContext(params: {
  deps: GitLabSkillSyncDeps;
  source: SkillSyncGitLabSourceConfig;
  fetchFn: FetchFn;
  assertNotCancelled: AssertNotCancelled;
}): Promise<ISkillSyncStatus> {
  if (!params.source.tenantId) {
    return syncSource(params);
  }
  return tenantStorage.run({ tenantId: params.source.tenantId }, async () => syncSource(params));
}

function getGitlabConfig(config: SkillSyncConfig | undefined): {
  enabled: boolean;
  intervalMinutes: number;
  runOnStartup: boolean;
  sources: SkillSyncGitLabSourceConfig[];
} {
  return {
    enabled: config?.gitlab?.enabled ?? false,
    intervalMinutes: config?.gitlab?.intervalMinutes ?? 60,
    runOnStartup: config?.gitlab?.runOnStartup ?? false,
    sources:
      config?.gitlab?.sources.map((source) => ({
        ...source,
        skillDiscoveryDepth: source.skillDiscoveryDepth ?? SKILL_SYNC_DEFAULT_DISCOVERY_DEPTH,
      })) ?? [],
  };
}

export function createGitLabSkillSyncRunner(deps: GitLabSkillSyncDeps): GitLabSkillSyncRunner {
  const fetchFn = deps.fetchFn ?? fetch;
  const lockOwnerPrefix = deps.lockOwner ?? `${process.pid}`;

  async function getStatus(): Promise<GitLabSkillSyncStatus> {
    const gitlab = getGitlabConfig(await deps.getConfig());
    const allowServerCredentials = deps.allowServerCredentials !== false;
    const [storedStatuses, credentials] = await Promise.all([
      deps.listStatuses(PROVIDER),
      allowServerCredentials ? deps.listCredentials(PROVIDER) : Promise.resolve([]),
    ]);
    const statusBySourceId = new Map(
      storedStatuses.map((status) => [makeStatusKey(status.sourceId, status.tenantId), status]),
    );
    const credentialByKey = new Map(
      credentials.map((credential) => [credential.credentialKey, credential]),
    );
    const sources = gitlab.sources.map((source) => {
      const stored = statusBySourceId.get(makeStatusKey(source.id, source.tenantId));
      const credential =
        allowServerCredentials && source.credentialKey
          ? credentialByKey.get(source.credentialKey)
          : null;
      const tokenEnvVar = getTokenEnvVarName(source.token);
      const envTokenPresent =
        allowServerCredentials && tokenEnvVar ? Boolean(process.env[tokenEnvVar]?.trim()) : false;
      return {
        provider: PROVIDER,
        sourceId: source.id,
        tenantId: source.tenantId,
        status: stored?.status ?? 'idle',
        credentialKey: source.credentialKey,
        credentialPresent: envTokenPresent || Boolean(credential),
        baseUrl: source.baseUrl,
        projectId: source.projectId,
        ref: source.ref,
        paths: source.paths,
        startedAt: stored?.startedAt,
        finishedAt: stored?.finishedAt,
        lastSuccessAt: stored?.lastSuccessAt,
        lastFailureAt: stored?.lastFailureAt,
        errorCode: stored?.errorCode,
        errorMessage: stored?.errorMessage,
        syncedSkillCount: stored?.syncedSkillCount ?? 0,
        syncedFileCount: stored?.syncedFileCount ?? 0,
        deletedSkillCount: stored?.deletedSkillCount ?? 0,
        deletedFileCount: stored?.deletedFileCount ?? 0,
        createdAt: stored?.createdAt,
        updatedAt: stored?.updatedAt,
      } satisfies ISkillSyncStatus & { credentialPresent: boolean };
    });
    return {
      enabled: gitlab.enabled,
      intervalMinutes: gitlab.intervalMinutes,
      runOnStartup: gitlab.runOnStartup,
      sources,
      credentials,
      fineGrainedTokenRecommendation: GITLAB_TOKEN_RECOMMENDATION,
    };
  }

  async function runOnce(): Promise<GitLabSkillSyncRunResult> {
    const gitlab = getGitlabConfig(await deps.getConfig());
    if (!gitlab.enabled || gitlab.sources.length === 0) {
      return { status: 'skipped', message: 'GitLab skill sync is disabled', sources: [] };
    }
    const allowServerCredentials = deps.allowServerCredentials !== false;
    if (!allowServerCredentials) {
      const status = await getStatus();
      if (!status.sources.some((source) => source.credentialPresent)) {
        return {
          status: 'skipped',
          message: 'GitLab skill sync credentials are not available for this runner',
          sources: status.sources,
        };
      }
    }
    const lockOwner = `${lockOwnerPrefix}:${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const acquired = await deps.tryAcquireLock({
      provider: PROVIDER,
      lockOwner,
      leaseMs: LOCK_LEASE_MS,
    });
    if (!acquired) {
      const status = await getStatus();
      return {
        status: 'skipped',
        message: 'GitLab skill sync is already running',
        sources: status.sources,
      };
    }
    let lockLost = false;
    const assertNotCancelled = () => {
      if (lockLost) {
        throw new SkillSyncError('SYNC_LOCK_LOST', 'GitLab skill sync lock was lost');
      }
    };
    const refreshTimer = setInterval(
      () => {
        deps
          .refreshLock({
            provider: PROVIDER,
            lockOwner,
            leaseMs: LOCK_LEASE_MS,
          })
          .then((refreshed) => {
            if (!refreshed) {
              lockLost = true;
              logger.warn('[GitLabSkillSync] Failed to refresh active sync lock');
            }
          })
          .catch((error) => {
            lockLost = true;
            logger.error('[GitLabSkillSync] Failed to refresh active sync lock:', error);
          });
      },
      Math.max(60_000, Math.floor(LOCK_LEASE_MS / 3)),
    );
    refreshTimer.unref?.();
    try {
      const sources: ISkillSyncStatus[] = [];
      for (const source of gitlab.sources) {
        if (lockLost) {
          break;
        }
        sources.push(
          await syncSourceInTenantContext({ deps, source, fetchFn, assertNotCancelled }),
        );
      }
      const failed = sources.some((source) => source.status === 'failed');
      return {
        status: failed || lockLost ? 'failed' : 'completed',
        message: lockLost ? 'GitLab skill sync lock was lost' : undefined,
        sources,
      };
    } finally {
      clearInterval(refreshTimer);
      await deps.releaseLock({ provider: PROVIDER, lockOwner });
    }
  }

  return { getStatus, runOnce };
}
