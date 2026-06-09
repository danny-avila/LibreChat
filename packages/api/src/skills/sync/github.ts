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
import type { SkillSyncConfig, SkillSyncGitHubSourceConfig } from 'librechat-data-provider';
import { DEFAULT_SKILL_IMPORT_LIMITS } from '../limits';
import { parseSkillMarkdown } from '../parse';

const GITHUB_API_BASE = 'https://api.github.com';
const SYSTEM_AUTHOR_ID = new Types.ObjectId('000000000000000000000000');
const SYSTEM_AUTHOR_NAME = 'GitHub Sync';
const PROVIDER: SkillSyncProvider = 'github';
const LOCK_LEASE_MS = 30 * 60 * 1000;

export const GITHUB_FINE_GRAINED_TOKEN_RECOMMENDATION =
  'Use a GitHub fine-grained personal access token scoped to the selected repository with read-only Contents and Metadata permissions.';

type FetchFn = typeof fetch;

type GitHubTreeEntry = {
  path: string;
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
  url: string;
};

type GitHubTreeResponse = {
  sha: string;
  tree: GitHubTreeEntry[];
  truncated: boolean;
};

type GitHubBlobResponse = {
  sha: string;
  content: string;
  encoding: string;
  size: number;
};

type GitHubCommitResponse = {
  sha: string;
  commit: {
    tree: {
      sha: string;
    };
  };
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
  skillMd: GitHubTreeEntry;
  files: GitHubTreeEntry[];
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

export type GitHubSkillSyncDeps = {
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
    source: 'github' | 'notion';
    upstreamId: string;
    tenantId?: string;
  }) => Promise<(ISkill & { _id: Types.ObjectId }) | null>;
  listSkillsBySource: (params: {
    source: 'github' | 'notion';
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

export type GitHubSkillSyncRunResult = {
  status: 'started' | 'skipped' | 'completed' | 'failed';
  message?: string;
  sources: Array<ISkillSyncStatus & { credentialPresent?: boolean }>;
};

export type GitHubSkillSyncStatus = {
  enabled: boolean;
  intervalMinutes: number;
  runOnStartup: boolean;
  sources: Array<ISkillSyncStatus & { credentialPresent: boolean }>;
  credentials: SkillSyncCredentialSummary[];
  fineGrainedTokenRecommendation: string;
};

export type GitHubSkillSyncRunner = {
  getStatus: () => Promise<GitHubSkillSyncStatus>;
  runOnce: () => Promise<GitHubSkillSyncRunResult>;
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

function makeUpstreamId(source: SkillSyncGitHubSourceConfig, rootPath: string): string {
  // Identity is keyed on the stable, admin-controlled source id and the skill's
  // root path only — never owner/repo/ref. Repointing a source to a renamed or
  // replacement repository (or rotating its ref) keeps the same upstream id, so
  // existing mirrors are updated in place instead of being treated as new and
  // colliding on the (name, author, tenantId) uniqueness constraint.
  return `${source.id}:${rootPath}`;
}

function makeSourceAuthorId(source: SkillSyncGitHubSourceConfig): Types.ObjectId {
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
  return normalized || 'github-skill';
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

function assertGitHubBlobSize(entry: GitHubTreeEntry, relativePath: string): number {
  if (typeof entry.size !== 'number' || !Number.isFinite(entry.size) || entry.size < 0) {
    throw new SkillSyncError(
      'GITHUB_BLOB_SIZE_UNKNOWN',
      `GitHub file "${relativePath}" did not include a valid blob size`,
    );
  }
  if (entry.size > DEFAULT_SKILL_IMPORT_LIMITS.maxSingleFileBytes) {
    throw new SkillSyncError(
      'GITHUB_BLOB_TOO_LARGE',
      `GitHub file "${relativePath}" exceeds the ${getLimitMegabytes(
        DEFAULT_SKILL_IMPORT_LIMITS.maxSingleFileBytes,
      )}MB per-file skill import limit`,
    );
  }
  return entry.size;
}

function assertGitHubBufferSize(buffer: Buffer, relativePath: string): void {
  if (buffer.length <= DEFAULT_SKILL_IMPORT_LIMITS.maxSingleFileBytes) {
    return;
  }
  throw new SkillSyncError(
    'GITHUB_BLOB_TOO_LARGE',
    `GitHub file "${relativePath}" exceeds the ${getLimitMegabytes(
      DEFAULT_SKILL_IMPORT_LIMITS.maxSingleFileBytes,
    )}MB per-file skill import limit`,
  );
}

function assertCumulativeGitHubFileSize(totalBytes: number): void {
  if (totalBytes <= DEFAULT_SKILL_IMPORT_LIMITS.maxDecompressedBytes) {
    return;
  }
  throw new SkillSyncError(
    'GITHUB_PACKAGE_TOO_LARGE',
    `GitHub skill files exceed the ${getLimitMegabytes(
      DEFAULT_SKILL_IMPORT_LIMITS.maxDecompressedBytes,
    )}MB cumulative skill import limit`,
  );
}

function assertGitHubEntryCount(discovered: DiscoveredSkill): void {
  const entryCount = discovered.files.length + 1;
  if (entryCount <= DEFAULT_SKILL_IMPORT_LIMITS.maxEntries) {
    return;
  }
  throw new SkillSyncError(
    'GITHUB_TOO_MANY_FILES',
    `GitHub skill "${discovered.rootPath}" exceeds the ${DEFAULT_SKILL_IMPORT_LIMITS.maxEntries} file skill import limit`,
  );
}

function getSkillMdPath(discovered: DiscoveredSkill): string {
  return discovered.rootPath ? `${discovered.rootPath}/SKILL.md` : 'SKILL.md';
}

function getDiscoveredRelativePath(discovered: DiscoveredSkill, entry: GitHubTreeEntry): string {
  const prefix = discovered.rootPath ? `${discovered.rootPath}/` : '';
  const normalized = normalizeRepoPath(entry.path);
  return prefix ? normalized.slice(prefix.length) : normalized;
}

function assertGitHubSkillPackageManifest(discovered: DiscoveredSkill): void {
  assertGitHubEntryCount(discovered);
  assertGitHubBlobSize(discovered.skillMd, getSkillMdPath(discovered));
  let totalFileBytes = 0;
  for (const entry of discovered.files) {
    const relativePath = getDiscoveredRelativePath(discovered, entry);
    if (!isSafeRelativePath(relativePath) || relativePath.toUpperCase() === 'SKILL.MD') {
      continue;
    }
    totalFileBytes += assertGitHubBlobSize(entry, relativePath);
    assertCumulativeGitHubFileSize(totalFileBytes);
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

function buildGitHubHeaders(token: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'LibreChat-Skill-Sync',
  };
}

function buildGitHubUrl(pathname: string): string {
  return `${GITHUB_API_BASE}${pathname}`;
}

function encodeGitHubPath(value: string): string {
  return value.split('/').map(encodeURIComponent).join('/');
}

async function readGitHubErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' ? body.message : undefined;
  } catch {
    return undefined;
  }
}

function isGitHubRateLimitResponse(params: {
  status: number;
  remaining: string | null;
  retryAfter: string | null;
  message?: string;
}): boolean {
  if (params.status === 429 || params.remaining === '0' || params.retryAfter) {
    return true;
  }
  const message = params.message?.toLowerCase() ?? '';
  return message.includes('rate limit') || message.includes('abuse detection');
}

async function githubJson<T>(params: {
  fetchFn: FetchFn;
  token: string;
  pathname: string;
}): Promise<T> {
  const response = await params.fetchFn(buildGitHubUrl(params.pathname), {
    headers: buildGitHubHeaders(params.token),
  });
  if (response.ok) {
    return (await response.json()) as T;
  }
  const remaining = response.headers.get('x-ratelimit-remaining');
  const retryAfter = response.headers.get('retry-after');
  const message = await readGitHubErrorMessage(response);
  if (response.status === 401 || response.status === 403 || response.status === 429) {
    const code = isGitHubRateLimitResponse({
      status: response.status,
      remaining,
      retryAfter,
      message,
    })
      ? 'GITHUB_RATE_LIMITED'
      : 'GITHUB_AUTH_FAILED';
    throw new SkillSyncError(code, `GitHub request failed with HTTP ${response.status}`);
  }
  if (response.status === 404) {
    throw new SkillSyncError('GITHUB_NOT_FOUND', 'GitHub repository, ref, or path was not found');
  }
  throw new SkillSyncError(
    'GITHUB_REQUEST_FAILED',
    `GitHub request failed with HTTP ${response.status}`,
  );
}

async function fetchCommit(params: {
  fetchFn: FetchFn;
  token: string;
  source: SkillSyncGitHubSourceConfig;
}): Promise<GitHubCommitResponse> {
  const owner = encodeURIComponent(params.source.owner);
  const repo = encodeURIComponent(params.source.repo);
  const ref = encodeGitHubPath(params.source.ref);
  return githubJson<GitHubCommitResponse>({
    fetchFn: params.fetchFn,
    token: params.token,
    pathname: `/repos/${owner}/${repo}/commits/${ref}`,
  });
}

async function fetchTree(params: {
  fetchFn: FetchFn;
  token: string;
  source: SkillSyncGitHubSourceConfig;
  treeSha: string;
  recursive?: boolean;
}): Promise<GitHubTreeResponse> {
  const owner = encodeURIComponent(params.source.owner);
  const repo = encodeURIComponent(params.source.repo);
  const treeSha = encodeURIComponent(params.treeSha);
  const recursive = params.recursive ?? true;
  return githubJson<GitHubTreeResponse>({
    fetchFn: params.fetchFn,
    token: params.token,
    pathname: `/repos/${owner}/${repo}/git/trees/${treeSha}${recursive ? '?recursive=1' : ''}`,
  });
}

async function fetchTreeAtPath(params: {
  fetchFn: FetchFn;
  token: string;
  source: SkillSyncGitHubSourceConfig;
  rootTreeSha: string;
  repoPath: string;
  assertNotCancelled: AssertNotCancelled;
}): Promise<GitHubTreeEntry[]> {
  const normalizedPath = normalizeRepoPath(params.repoPath);
  let treeSha = params.rootTreeSha;
  if (normalizedPath) {
    for (const segment of normalizedPath.split('/')) {
      params.assertNotCancelled();
      const tree = await fetchTree({
        fetchFn: params.fetchFn,
        token: params.token,
        source: params.source,
        treeSha,
        recursive: false,
      });
      params.assertNotCancelled();
      if (tree.truncated) {
        throw new SkillSyncError('GITHUB_TREE_TRUNCATED', 'GitHub tree response was truncated');
      }
      const next = tree.tree.find((entry) => entry.type === 'tree' && entry.path === segment);
      if (!next) {
        throw new SkillSyncError(
          'GITHUB_PATH_NOT_FOUND',
          `Configured GitHub skill path "${normalizedPath}" was not found`,
        );
      }
      treeSha = next.sha;
    }
  }

  params.assertNotCancelled();
  const tree = await fetchTree({
    fetchFn: params.fetchFn,
    token: params.token,
    source: params.source,
    treeSha,
    recursive: true,
  });
  params.assertNotCancelled();
  if (tree.truncated) {
    throw new SkillSyncError('GITHUB_TREE_TRUNCATED', 'GitHub tree response was truncated');
  }
  if (!normalizedPath) {
    return tree.tree;
  }
  return tree.tree.map((entry) => ({
    ...entry,
    path: `${normalizedPath}/${normalizeRepoPath(entry.path)}`,
  }));
}

async function fetchConfiguredTreeEntries(params: {
  fetchFn: FetchFn;
  token: string;
  source: SkillSyncGitHubSourceConfig;
  rootTreeSha: string;
  assertNotCancelled: AssertNotCancelled;
}): Promise<GitHubTreeEntry[]> {
  const entriesByPath = new Map<string, GitHubTreeEntry>();
  for (const repoPath of params.source.paths) {
    const entries = await fetchTreeAtPath({ ...params, repoPath });
    for (const entry of entries) {
      const normalizedPath = normalizeRepoPath(entry.path);
      entriesByPath.set(normalizedPath, { ...entry, path: normalizedPath });
    }
  }
  return [...entriesByPath.values()];
}

async function fetchBlob(params: {
  fetchFn: FetchFn;
  token: string;
  source: SkillSyncGitHubSourceConfig;
  sha: string;
}): Promise<Buffer> {
  const owner = encodeURIComponent(params.source.owner);
  const repo = encodeURIComponent(params.source.repo);
  const sha = encodeURIComponent(params.sha);
  const blob = await githubJson<GitHubBlobResponse>({
    fetchFn: params.fetchFn,
    token: params.token,
    pathname: `/repos/${owner}/${repo}/git/blobs/${sha}`,
  });
  if (blob.encoding !== 'base64') {
    throw new SkillSyncError(
      'GITHUB_UNSUPPORTED_BLOB',
      `Unsupported GitHub blob encoding "${blob.encoding}"`,
    );
  }
  return Buffer.from(blob.content.replace(/\s/g, ''), 'base64');
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
  tree: GitHubTreeEntry[],
  source: SkillSyncGitHubSourceConfig,
): DiscoveredSkill[] {
  const basePaths = source.paths.map(normalizeRepoPath);
  const skillDiscoveryDepth = source.skillDiscoveryDepth ?? SKILL_SYNC_DEFAULT_DISCOVERY_DEPTH;
  const skillMdByRoot = new Map<string, GitHubTreeEntry>();
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
  tree: GitHubTreeEntry[],
  source: SkillSyncGitHubSourceConfig,
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
        'GITHUB_PATH_NOT_FOUND',
        `Configured GitHub skill path "${configuredPath}" was not found`,
      );
    }
  }
}

function makeStatusInput(params: {
  source: SkillSyncGitHubSourceConfig;
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
    owner: params.source.owner,
    repo: params.source.repo,
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
  deps: GitHubSkillSyncDeps,
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
  deps: GitHubSkillSyncDeps;
  source: SkillSyncGitHubSourceConfig;
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
    owner: source.owner,
    repo: source.repo,
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
  deps: GitHubSkillSyncDeps,
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
  deps: GitHubSkillSyncDeps,
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

async function cleanupFile(deps: GitHubSkillSyncDeps, file: StoredSkillFileRef): Promise<void> {
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
  deps: GitHubSkillSyncDeps;
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
  deps: GitHubSkillSyncDeps;
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
    logMessage: '[GitHubSkillSync] Failed to clean up rolled-back synced file:',
  });
}

async function deleteSyncedSkillForRestore(
  deps: GitHubSkillSyncDeps,
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
  deps: GitHubSkillSyncDeps,
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
  deps: GitHubSkillSyncDeps,
  deleted: DeletedSyncedSkillJournal,
): Promise<void> {
  await cleanupStoredFiles({
    deps,
    files: deleted.files.map(toStoredFileRefFromSkillFile),
    logMessage: '[GitHubSkillSync] Failed to clean up deleted stale mirrored skill file:',
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
  source: SkillSyncGitHubSourceConfig;
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
  source: SkillSyncGitHubSourceConfig;
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
  source: SkillSyncGitHubSourceConfig;
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
  source: SkillSyncGitHubSourceConfig,
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
        `GitHub source "${source.id}" contains multiple skills named "${prepared.createInput.name}"`,
      );
    }
    seen.set(key, discovered.rootPath);
  }
}

async function deleteNameConflictingStaleSkill(params: {
  deps: GitHubSkillSyncDeps;
  source: SkillSyncGitHubSourceConfig;
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
  deps: GitHubSkillSyncDeps;
  token: string;
  source: SkillSyncGitHubSourceConfig;
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
    totalFileBytes += assertGitHubBlobSize(entry, relativePath);
    assertCumulativeGitHubFileSize(totalFileBytes);
    remotePaths.add(relativePath);
    const existing = await deps.getSkillFileByPath(skill._id, relativePath);
    if (existing && getSourceMetadataString(existing, 'blobSha') === entry.sha) {
      continue;
    }
    const buffer = await fetchBlob({ fetchFn, token, source, sha: entry.sha });
    assertNotCancelled();
    assertGitHubBufferSize(buffer, relativePath);
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
        logger.error('[GitHubSkillSync] Failed to clean up orphaned synced file:', cleanupError),
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
  deps: GitHubSkillSyncDeps,
  skill: ISkill & { _id: Types.ObjectId },
): Promise<number> {
  const files = await deps.listSkillFiles(skill._id);
  let deletedFiles = 0;
  for (const file of files) {
    await cleanupFile(deps, file).catch((cleanupError) =>
      logger.error('[GitHubSkillSync] Failed to clean up mirrored skill file:', cleanupError),
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

async function resolveGitHubToken(
  deps: GitHubSkillSyncDeps,
  source: SkillSyncGitHubSourceConfig,
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
  source: SkillSyncGitHubSourceConfig,
  allowServerCredentials: boolean,
): string {
  if (!allowServerCredentials) {
    return 'Server GitHub credentials are not available for this skill sync config';
  }
  const tokenEnvVar = getTokenEnvVarName(source.token);
  if (tokenEnvVar) {
    return `Missing GitHub token environment variable "${tokenEnvVar}"`;
  }
  return `Missing GitHub credential "${source.credentialKey ?? source.id}"`;
}

async function syncSource(params: {
  deps: GitHubSkillSyncDeps;
  source: SkillSyncGitHubSourceConfig;
  fetchFn: FetchFn;
  assertNotCancelled: AssertNotCancelled;
}): Promise<ISkillSyncStatus> {
  const { deps, source, fetchFn, assertNotCancelled } = params;
  const startedAt = new Date();
  await deps.upsertStatus(makeStatusInput({ source, status: 'running', startedAt }));
  try {
    assertNotCancelled();
    const allowServerCredentials = deps.allowServerCredentials !== false;
    const token = await resolveGitHubToken(deps, source);
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
      assertGitHubSkillPackageManifest(discovered);
      const skillMdPath = getSkillMdPath(discovered);
      const skillMdBuffer = await fetchBlob({
        fetchFn,
        token,
        source,
        sha: discovered.skillMd.sha,
      });
      assertNotCancelled();
      assertGitHubBufferSize(skillMdBuffer, skillMdPath);
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
              '[GitHubSkillSync] Failed to restore existing skill files after sync failure:',
              cleanupError,
            ),
          );
          if (staleConflictCleanup?.deletedSkill) {
            await restoreDeletedSyncedSkill(deps, staleConflictCleanup.deletedSkill).catch(
              (cleanupError) =>
                logger.error(
                  '[GitHubSkillSync] Failed to restore stale mirrored skill after sync failure:',
                  cleanupError,
                ),
            );
          }
          throw error;
        }
        await cleanupStoredFiles({
          deps,
          files: fileCounts.staleFiles,
          logMessage: '[GitHubSkillSync] Failed to clean up replaced synced file:',
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
            '[GitHubSkillSync] Failed to roll back partially synced skill:',
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
    // return github skills across tenants, so without this guard an ambient sync
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
    logger.error(`[GitHubSkillSync] Source "${source.id}" failed: ${sanitized.message}`);
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
  deps: GitHubSkillSyncDeps;
  source: SkillSyncGitHubSourceConfig;
  fetchFn: FetchFn;
  assertNotCancelled: AssertNotCancelled;
}): Promise<ISkillSyncStatus> {
  if (!params.source.tenantId) {
    return syncSource(params);
  }
  return tenantStorage.run({ tenantId: params.source.tenantId }, async () => syncSource(params));
}

function getGithubConfig(config: SkillSyncConfig | undefined): {
  enabled: boolean;
  intervalMinutes: number;
  runOnStartup: boolean;
  sources: SkillSyncGitHubSourceConfig[];
} {
  return {
    enabled: config?.github?.enabled ?? false,
    intervalMinutes: config?.github?.intervalMinutes ?? 60,
    runOnStartup: config?.github?.runOnStartup ?? false,
    sources:
      config?.github?.sources.map((source) => ({
        ...source,
        skillDiscoveryDepth: source.skillDiscoveryDepth ?? SKILL_SYNC_DEFAULT_DISCOVERY_DEPTH,
      })) ?? [],
  };
}

export function createGitHubSkillSyncRunner(deps: GitHubSkillSyncDeps): GitHubSkillSyncRunner {
  const fetchFn = deps.fetchFn ?? fetch;
  const lockOwnerPrefix = deps.lockOwner ?? `${process.pid}`;

  async function getStatus(): Promise<GitHubSkillSyncStatus> {
    const github = getGithubConfig(await deps.getConfig());
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
    const sources = github.sources.map((source) => {
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
        owner: source.owner,
        repo: source.repo,
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
      enabled: github.enabled,
      intervalMinutes: github.intervalMinutes,
      runOnStartup: github.runOnStartup,
      sources,
      credentials,
      fineGrainedTokenRecommendation: GITHUB_FINE_GRAINED_TOKEN_RECOMMENDATION,
    };
  }

  async function runOnce(): Promise<GitHubSkillSyncRunResult> {
    const github = getGithubConfig(await deps.getConfig());
    if (!github.enabled || github.sources.length === 0) {
      return { status: 'skipped', message: 'GitHub skill sync is disabled', sources: [] };
    }
    const allowServerCredentials = deps.allowServerCredentials !== false;
    if (!allowServerCredentials) {
      const status = await getStatus();
      if (!status.sources.some((source) => source.credentialPresent)) {
        return {
          status: 'skipped',
          message: 'GitHub skill sync credentials are not available for this runner',
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
        message: 'GitHub skill sync is already running',
        sources: status.sources,
      };
    }
    let lockLost = false;
    const assertNotCancelled = () => {
      if (lockLost) {
        throw new SkillSyncError('SYNC_LOCK_LOST', 'GitHub skill sync lock was lost');
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
              logger.warn('[GitHubSkillSync] Failed to refresh active sync lock');
            }
          })
          .catch((error) => {
            lockLost = true;
            logger.error('[GitHubSkillSync] Failed to refresh active sync lock:', error);
          });
      },
      Math.max(60_000, Math.floor(LOCK_LEASE_MS / 3)),
    );
    refreshTimer.unref?.();
    try {
      const sources: ISkillSyncStatus[] = [];
      for (const source of github.sources) {
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
        message: lockLost ? 'GitHub skill sync lock was lost' : undefined,
        sources,
      };
    } finally {
      clearInterval(refreshTimer);
      await deps.releaseLock({ provider: PROVIDER, lockOwner });
    }
  }

  return { getStatus, runOnce };
}
