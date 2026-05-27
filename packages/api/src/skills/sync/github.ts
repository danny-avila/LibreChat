import crypto from 'crypto';
import path from 'path';
import { Types } from 'mongoose';
import { ResourceType, PrincipalType, AccessRoleIds } from 'librechat-data-provider';
import { logger } from '@librechat/data-schemas';
import type { SkillSyncConfig, SkillSyncGitHubSourceConfig } from 'librechat-data-provider';
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

type DiscoveredSkill = {
  rootPath: string;
  skillMd: GitHubTreeEntry;
  files: GitHubTreeEntry[];
};

type SaveBufferResult = {
  filepath: string;
  source: string;
  storageKey?: string;
  storageRegion?: string;
};

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
  }) => Promise<boolean>;
  refreshLock: (params: {
    provider: SkillSyncProvider;
    lockOwner: string;
    leaseMs: number;
  }) => Promise<boolean>;
  releaseLock: (params: { provider: SkillSyncProvider; lockOwner: string }) => Promise<void>;
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
};

export type GitHubSkillSyncRunResult = {
  status: 'started' | 'skipped' | 'completed' | 'failed';
  message?: string;
  sources: ISkillSyncStatus[];
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
  return `${source.id}:${source.owner}/${source.repo}:${rootPath}`;
}

function makeSourceAuthorId(source: SkillSyncGitHubSourceConfig): Types.ObjectId {
  const digest = crypto
    .createHash('sha256')
    .update(`${PROVIDER}:${source.id}`)
    .digest('hex')
    .slice(0, 24);
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
): Record<string, unknown> | undefined {
  if (!frontmatter) {
    return undefined;
  }
  const clean = { ...frontmatter };
  delete clean.name;
  delete clean.description;
  return Object.keys(clean).length > 0 ? clean : undefined;
}

function getSourceMetadataString(
  file: ISkillFile & { _id: Types.ObjectId },
  key: string,
): string | undefined {
  const metadata = file.sourceMetadata;
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
  if (response.status === 401 || response.status === 403) {
    const code = remaining === '0' ? 'GITHUB_RATE_LIMITED' : 'GITHUB_AUTH_FAILED';
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
  const ref = encodeURIComponent(params.source.ref);
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
}): Promise<GitHubTreeResponse> {
  const owner = encodeURIComponent(params.source.owner);
  const repo = encodeURIComponent(params.source.repo);
  const treeSha = encodeURIComponent(params.treeSha);
  return githubJson<GitHubTreeResponse>({
    fetchFn: params.fetchFn,
    token: params.token,
    pathname: `/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
  });
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

function discoverSkills(
  tree: GitHubTreeEntry[],
  source: SkillSyncGitHubSourceConfig,
): DiscoveredSkill[] {
  const basePaths = source.paths.map(normalizeRepoPath);
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
      const relative = basePath ? parent.slice(basePath.length).replace(/^\/+/, '') : parent;
      const isBaseSkill = parent === basePath;
      const isOneLevelBelow =
        parent.startsWith(basePath ? `${basePath}/` : '') &&
        relative.length > 0 &&
        !relative.includes('/');
      if (isBaseSkill || isOneLevelBelow) {
        skillMdByRoot.set(parent, entry);
      }
    }
  }

  return [...skillMdByRoot.entries()].map(([rootPath, skillMd]) => {
    const prefix = rootPath ? `${rootPath}/` : '';
    const files = tree.filter((entry) => {
      if (entry.type !== 'blob') {
        return false;
      }
      const normalized = normalizeRepoPath(entry.path);
      if (!normalized.startsWith(prefix) || normalized === skillMd.path) {
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

async function upsertRemoteSkill(params: {
  deps: GitHubSkillSyncDeps;
  source: SkillSyncGitHubSourceConfig;
  discovered: DiscoveredSkill;
  skillMdContent: string;
  commitSha: string;
  syncedAt: Date;
}): Promise<ISkill & { _id: Types.ObjectId }> {
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
  const existing = await deps.findSkillBySourceIdentity({ source: PROVIDER, upstreamId });
  if (existing) {
    const result = await deps.updateSkill({
      id: existing._id.toString(),
      expectedVersion: existing.version,
      update,
    });
    if (result.status === 'updated') {
      await ensurePublicViewer(deps, result.skill._id);
      return result.skill;
    }
    if (result.status === 'conflict') {
      throw new SkillSyncError('SKILL_CONFLICT', `Skill "${existing.name}" changed during sync`);
    }
    throw new SkillSyncError(
      'SKILL_NOT_FOUND',
      `Previously synced skill "${existing.name}" was removed`,
    );
  }
  const createInput: CreateSkillInput = {
    ...(update as Omit<UpdateSkillInput, 'source'>),
    name: update.name ?? fallbackName,
    description: update.description ?? fallbackName,
    author: makeSourceAuthorId(source),
    authorName: SYSTEM_AUTHOR_NAME,
    source: PROVIDER,
  };
  const created = await deps.createSkill(createInput);
  await ensurePublicViewer(deps, created.skill._id);
  return created.skill;
}

async function cleanupFile(
  deps: GitHubSkillSyncDeps,
  file: ISkillFile & { _id: Types.ObjectId },
): Promise<void> {
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

async function syncSkillFiles(params: {
  deps: GitHubSkillSyncDeps;
  token: string;
  source: SkillSyncGitHubSourceConfig;
  skill: ISkill & { _id: Types.ObjectId };
  discovered: DiscoveredSkill;
  commitSha: string;
  fetchFn: FetchFn;
}): Promise<Pick<SyncCounters, 'syncedFileCount' | 'deletedFileCount'>> {
  const { deps, token, source, skill, discovered, commitSha, fetchFn } = params;
  const prefix = discovered.rootPath ? `${discovered.rootPath}/` : '';
  const remotePaths = new Set<string>();
  let syncedFileCount = 0;
  let deletedFileCount = 0;

  for (const entry of discovered.files) {
    const normalized = normalizeRepoPath(entry.path);
    const relativePath = prefix ? normalized.slice(prefix.length) : normalized;
    if (!isSafeRelativePath(relativePath) || relativePath.toUpperCase() === 'SKILL.MD') {
      continue;
    }
    remotePaths.add(relativePath);
    syncedFileCount++;
    const existing = await deps.getSkillFileByPath(skill._id, relativePath);
    if (existing && getSourceMetadataString(existing, 'blobSha') === entry.sha) {
      continue;
    }
    const buffer = await fetchBlob({ fetchFn, token, source, sha: entry.sha });
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
      if (deps.deleteFile) {
        await deps
          .deleteFile({
            filepath: saved.filepath,
            source: saved.source,
            storageKey: saved.storageKey,
            storageRegion: saved.storageRegion,
            user: skill.author,
            tenantId: skill.tenantId,
          })
          .catch((cleanupError) =>
            logger.error(
              '[GitHubSkillSync] Failed to clean up orphaned synced file:',
              cleanupError,
            ),
          );
      }
      throw error;
    }
    if (existing && existing.filepath !== saved.filepath) {
      await cleanupFile(deps, existing).catch((cleanupError) =>
        logger.error('[GitHubSkillSync] Failed to clean up replaced synced file:', cleanupError),
      );
    }
  }

  const existingFiles = await deps.listSkillFiles(skill._id);
  for (const file of existingFiles) {
    if (remotePaths.has(file.relativePath)) {
      continue;
    }
    await cleanupFile(deps, file).catch((cleanupError) =>
      logger.error('[GitHubSkillSync] Failed to clean up deleted synced file:', cleanupError),
    );
    const result = await deps.deleteSkillFile(skill._id, file.relativePath);
    if (result.deleted) {
      deletedFileCount++;
    }
  }
  return { syncedFileCount, deletedFileCount };
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

async function syncSource(params: {
  deps: GitHubSkillSyncDeps;
  source: SkillSyncGitHubSourceConfig;
  fetchFn: FetchFn;
}): Promise<ISkillSyncStatus> {
  const { deps, source, fetchFn } = params;
  const startedAt = new Date();
  await deps.upsertStatus(makeStatusInput({ source, status: 'running', startedAt }));
  try {
    const token = await deps.getCredentialToken(PROVIDER, source.credentialKey);
    if (!token) {
      throw new SkillSyncError(
        'MISSING_CREDENTIAL',
        `Missing GitHub credential "${source.credentialKey}"`,
      );
    }
    const commit = await fetchCommit({ fetchFn, token, source });
    const tree = await fetchTree({ fetchFn, token, source, treeSha: commit.commit.tree.sha });
    if (tree.truncated) {
      throw new SkillSyncError('GITHUB_TREE_TRUNCATED', 'GitHub tree response was truncated');
    }
    assertConfiguredPathsExist(tree.tree, source);
    const discoveredSkills = discoverSkills(tree.tree, source);
    const seenUpstreamIds = new Set<string>();
    const counts: SyncCounters = {
      syncedSkillCount: 0,
      syncedFileCount: 0,
      deletedSkillCount: 0,
      deletedFileCount: 0,
    };
    const syncedAt = new Date();

    for (const discovered of discoveredSkills) {
      const skillMdBuffer = await fetchBlob({
        fetchFn,
        token,
        source,
        sha: discovered.skillMd.sha,
      });
      const skill = await upsertRemoteSkill({
        deps,
        source,
        discovered,
        skillMdContent: skillMdBuffer.toString('utf-8'),
        commitSha: commit.sha,
        syncedAt,
      });
      seenUpstreamIds.add(makeUpstreamId(source, discovered.rootPath));
      counts.syncedSkillCount++;
      const fileCounts = await syncSkillFiles({
        deps,
        token,
        source,
        skill,
        discovered,
        commitSha: commit.sha,
        fetchFn,
      });
      counts.syncedFileCount += fileCounts.syncedFileCount;
      counts.deletedFileCount += fileCounts.deletedFileCount;
    }

    const existingSyncedSkills = await deps.listSkillsBySource({
      source: PROVIDER,
      sourceId: source.id,
    });
    for (const skill of existingSyncedSkills) {
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
    sources: config?.github?.sources ?? [],
  };
}

export function createGitHubSkillSyncRunner(deps: GitHubSkillSyncDeps) {
  const fetchFn = deps.fetchFn ?? fetch;
  const lockOwner =
    deps.lockOwner ?? `${process.pid}:${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

  async function getStatus() {
    const github = getGithubConfig(await deps.getConfig());
    const [storedStatuses, credentials] = await Promise.all([
      deps.listStatuses(PROVIDER),
      deps.listCredentials(PROVIDER),
    ]);
    const statusBySourceId = new Map(storedStatuses.map((status) => [status.sourceId, status]));
    const credentialByKey = new Map(
      credentials.map((credential) => [credential.credentialKey, credential]),
    );
    const sources = github.sources.map((source) => {
      const stored = statusBySourceId.get(source.id);
      const credential = credentialByKey.get(source.credentialKey);
      return {
        provider: PROVIDER,
        sourceId: source.id,
        status: stored?.status ?? 'idle',
        credentialKey: source.credentialKey,
        credentialPresent: Boolean(credential),
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
    const acquired = await deps.tryAcquireLock({
      provider: PROVIDER,
      lockOwner,
      leaseMs: LOCK_LEASE_MS,
    });
    if (!acquired) {
      const statuses = await deps.listStatuses(PROVIDER);
      return {
        status: 'skipped',
        message: 'GitHub skill sync is already running',
        sources: statuses,
      };
    }
    const refreshTimer = setInterval(
      () => {
        deps
          .refreshLock({ provider: PROVIDER, lockOwner, leaseMs: LOCK_LEASE_MS })
          .then((refreshed) => {
            if (!refreshed) {
              logger.warn('[GitHubSkillSync] Failed to refresh active sync lock');
            }
          })
          .catch((error) => {
            logger.error('[GitHubSkillSync] Failed to refresh active sync lock:', error);
          });
      },
      Math.max(60_000, Math.floor(LOCK_LEASE_MS / 3)),
    );
    refreshTimer.unref?.();
    try {
      const sources: ISkillSyncStatus[] = [];
      for (const source of github.sources) {
        sources.push(await syncSource({ deps, source, fetchFn }));
      }
      const failed = sources.some((source) => source.status === 'failed');
      return {
        status: failed ? 'failed' : 'completed',
        sources,
      };
    } finally {
      clearInterval(refreshTimer);
      await deps.releaseLock({ provider: PROVIDER, lockOwner });
    }
  }

  return { getStatus, runOnce };
}

export type GitHubSkillSyncRunner = ReturnType<typeof createGitHubSkillSyncRunner>;
