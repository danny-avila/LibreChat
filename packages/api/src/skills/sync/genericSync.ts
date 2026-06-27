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
  ISkillSyncStatus,
  SkillSyncProvider,
  SkillSyncStatusInput,
  UpsertSkillFileInput,
} from '@librechat/data-schemas';
import type { GitRepoAdapter, GitTreeEntry } from './adapter';
import type { GitHubSkillSyncDeps } from './github';
import { DEFAULT_SKILL_IMPORT_LIMITS } from '../limits';
import { parseSkillMarkdown } from '../parse';

const SYSTEM_AUTHOR_ID = new Types.ObjectId('000000000000000000000000');

type AssertNotCancelled = () => void;

export type GenericSourceConfig = {
  id: string;
  ref: string;
  paths: string[];
  skillDiscoveryDepth?: number;
  credentialKey?: string;
  token?: string;
  tenantId?: string;
};

type DiscoveredSkill = {
  rootPath: string;
  skillMd: GitTreeEntry;
  files: GitTreeEntry[];
};

type SyncCounters = {
  syncedSkillCount: number;
  syncedFileCount: number;
  deletedSkillCount: number;
  deletedFileCount: number;
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

// --- Pure helpers (duplicated from github.ts to avoid modifying it) ---

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

function toSkillName(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return normalized || 'synced-skill';
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
    '.json': 'application/json',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.py': 'text/x-python',
    '.sh': 'application/x-sh',
    '.css': 'text/css',
    '.html': 'text/html',
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
  if ('always-apply' in clean && typeof clean['always-apply'] !== 'boolean') {
    delete clean['always-apply'];
  }
  if ('alwaysApply' in clean && typeof clean.alwaysApply !== 'boolean') {
    delete clean.alwaysApply;
  }
  return clean;
}

function getProviderAuthorName(provider: SkillSyncProvider): string {
  switch (provider) {
    case 'gitlab':
      return 'GitLab Sync';
    case 'bitbucket':
      return 'Bitbucket Sync';
    case 'azuredevops':
      return 'Azure DevOps Sync';
    default:
      return 'Skill Sync';
  }
}

function makeUpstreamId(source: GenericSourceConfig, rootPath: string): string {
  return `${source.id}:${rootPath}`;
}

function makeSourceAuthorId(
  provider: SkillSyncProvider,
  source: GenericSourceConfig,
): Types.ObjectId {
  const seed = source.tenantId
    ? `${provider}:${source.id}:${source.tenantId}`
    : `${provider}:${source.id}`;
  const digest = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 24);
  return new Types.ObjectId(digest);
}

function getLimitMegabytes(bytes: number): number {
  return Math.round(bytes / 1024 / 1024);
}

function assertBlobSize(entry: GitTreeEntry, relativePath: string): number {
  if (typeof entry.size !== 'number' || !Number.isFinite(entry.size) || entry.size < 0) {
    // If size not available from tree listing, skip pre-check (will check buffer after fetch)
    return 0;
  }
  if (entry.size > DEFAULT_SKILL_IMPORT_LIMITS.maxSingleFileBytes) {
    throw new GenericSyncError(
      'BLOB_TOO_LARGE',
      `File "${relativePath}" exceeds the ${getLimitMegabytes(DEFAULT_SKILL_IMPORT_LIMITS.maxSingleFileBytes)}MB per-file limit`,
    );
  }
  return entry.size;
}

function assertBufferSize(buffer: Buffer, relativePath: string): void {
  if (buffer.length > DEFAULT_SKILL_IMPORT_LIMITS.maxSingleFileBytes) {
    throw new GenericSyncError(
      'BLOB_TOO_LARGE',
      `File "${relativePath}" exceeds the ${getLimitMegabytes(DEFAULT_SKILL_IMPORT_LIMITS.maxSingleFileBytes)}MB per-file limit`,
    );
  }
}

function assertCumulativeSize(totalBytes: number): void {
  if (totalBytes > DEFAULT_SKILL_IMPORT_LIMITS.maxDecompressedBytes) {
    throw new GenericSyncError(
      'PACKAGE_TOO_LARGE',
      `Skill files exceed the ${getLimitMegabytes(DEFAULT_SKILL_IMPORT_LIMITS.maxDecompressedBytes)}MB cumulative limit`,
    );
  }
}

function assertEntryCount(discovered: DiscoveredSkill): void {
  if (discovered.files.length + 1 > DEFAULT_SKILL_IMPORT_LIMITS.maxEntries) {
    throw new GenericSyncError(
      'TOO_MANY_FILES',
      `Skill "${discovered.rootPath}" exceeds the ${DEFAULT_SKILL_IMPORT_LIMITS.maxEntries} file limit`,
    );
  }
}

class GenericSyncError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'GenericSyncError';
    this.code = code;
  }
}

function sanitizeError(error: unknown): { code: string; message: string } {
  if (error instanceof GenericSyncError) {
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

function getTokenEnvVarName(tokenReference: string | undefined): string | null {
  const match = tokenReference?.trim().match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/);
  return match?.[1] ?? null;
}

function resolveToken(
  deps: GitHubSkillSyncDeps,
  provider: SkillSyncProvider,
  source: GenericSourceConfig,
): Promise<string | null> {
  if (deps.allowServerCredentials === false) {
    return Promise.resolve(null);
  }
  const tokenEnvVar = getTokenEnvVarName(source.token);
  if (tokenEnvVar) {
    return Promise.resolve(process.env[tokenEnvVar]?.trim() || null);
  }
  if (!source.credentialKey) {
    return Promise.resolve(null);
  }
  return deps.getCredentialToken(provider, source.credentialKey);
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

function filterTreeByPaths(tree: GitTreeEntry[], paths: string[]): GitTreeEntry[] {
  const normalizedPaths = paths.map(normalizeRepoPath);
  return tree.filter((entry) => {
    const entryPath = normalizeRepoPath(entry.path);
    return normalizedPaths.some(
      (basePath) =>
        basePath === '' || entryPath === basePath || entryPath.startsWith(`${basePath}/`),
    );
  });
}

function discoverSkills(tree: GitTreeEntry[], source: GenericSourceConfig): DiscoveredSkill[] {
  const basePaths = source.paths.map(normalizeRepoPath);
  const skillDiscoveryDepth = source.skillDiscoveryDepth ?? SKILL_SYNC_DEFAULT_DISCOVERY_DEPTH;
  const skillMdByRoot = new Map<string, GitTreeEntry>();

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
    const childSkillRoots = skillRoots.filter(
      (c) => c && c !== rootPath && (rootPath ? c.startsWith(`${rootPath}/`) : true),
    );
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

function getDiscoveredRelativePath(discovered: DiscoveredSkill, entry: GitTreeEntry): string {
  const prefix = discovered.rootPath ? `${discovered.rootPath}/` : '';
  const normalized = normalizeRepoPath(entry.path);
  return prefix ? normalized.slice(prefix.length) : normalized;
}

function makeStatusInput(params: {
  provider: SkillSyncProvider;
  source: GenericSourceConfig;
  status: SkillSyncStatusInput['status'];
  startedAt?: Date;
  finishedAt?: Date;
  errorCode?: string;
  errorMessage?: string;
  counts?: Partial<SyncCounters>;
}): SkillSyncStatusInput {
  return {
    provider: params.provider,
    sourceId: params.source.id,
    tenantId: params.source.tenantId,
    status: params.status,
    credentialKey: params.source.credentialKey,
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

function getSourceMetadataString(
  row: { sourceMetadata?: Record<string, unknown> },
  key: string,
): string | undefined {
  const metadata = row.sourceMetadata;
  const value = metadata && typeof metadata === 'object' ? metadata[key] : undefined;
  return typeof value === 'string' ? value : undefined;
}

/**
 * Build the blob reference to pass to adapter.fetchBlob().
 * Bitbucket requires "commitSha:filePath" format; others use the entry sha directly.
 */
function makeBlobRef(
  provider: SkillSyncProvider,
  entry: GitTreeEntry,
  commitSha: string,
): string {
  if (provider === 'bitbucket') {
    return `${commitSha}:${entry.path}`;
  }
  return entry.sha;
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

export async function syncGenericSource(params: {
  deps: GitHubSkillSyncDeps;
  adapter: GitRepoAdapter;
  provider: SkillSyncProvider;
  source: GenericSourceConfig;
  assertNotCancelled: AssertNotCancelled;
}): Promise<ISkillSyncStatus> {
  const { deps, adapter, provider, source, assertNotCancelled } = params;
  const startedAt = new Date();
  await deps.upsertStatus(makeStatusInput({ provider, source, status: 'running', startedAt }));

  try {
    assertNotCancelled();
    const token = await resolveToken(deps, provider, source);
    assertNotCancelled();
    if (!token) {
      throw new GenericSyncError(
        'MISSING_CREDENTIAL',
        `Missing ${provider} credential for source "${source.id}"`,
      );
    }

    const { commitSha, treeSha } = await adapter.getTreeSha(source.ref);
    assertNotCancelled();

    const fullTree = await adapter.listTree(treeSha, true);
    assertNotCancelled();

    const tree = filterTreeByPaths(fullTree, source.paths);
    const discoveredSkills = discoverSkills(tree, source);
    const authorId = makeSourceAuthorId(provider, source);
    const authorName = getProviderAuthorName(provider);
    const syncedAt = new Date();
    const seenUpstreamIds = new Set<string>();
    const counts: SyncCounters = {
      syncedSkillCount: 0,
      syncedFileCount: 0,
      deletedSkillCount: 0,
      deletedFileCount: 0,
    };

    for (const discovered of discoveredSkills) {
      assertNotCancelled();
      assertEntryCount(discovered);

      const skillMdPath = discovered.rootPath
        ? `${discovered.rootPath}/SKILL.md`
        : 'SKILL.md';
      const blobRef = makeBlobRef(provider, discovered.skillMd, commitSha);
      const skillMdBuffer = await adapter.fetchBlob(blobRef);
      assertNotCancelled();
      assertBufferSize(skillMdBuffer, skillMdPath);

      const skillMdContent = skillMdBuffer.toString('utf-8');
      const parsed = parseSkillMarkdown(skillMdContent);
      if (parsed.parseError) {
        throw new GenericSyncError(
          'SKILL_PARSE_FAILED',
          `${skillMdPath} contains invalid YAML frontmatter: ${parsed.parseError}`,
        );
      }

      const upstreamId = makeUpstreamId(source, discovered.rootPath);
      seenUpstreamIds.add(upstreamId);
      const fallbackName = toSkillName(path.posix.basename(discovered.rootPath) || source.id);

      const sourceMetadata = {
        provider,
        sourceId: source.id,
        upstreamId,
        ref: source.ref,
        skillPath: discovered.rootPath,
        commitSha,
        skillBlobSha: discovered.skillMd.sha,
        syncedAt: syncedAt.toISOString(),
        syncStatus: 'synced',
      };

      const update = {
        name: parsed.name || fallbackName,
        description: parsed.description || parsed.name || fallbackName,
        body: skillMdContent,
        frontmatter: toCleanFrontmatter(parsed.frontmatter),
        alwaysApply: parsed.alwaysApply,
        source: provider,
        sourceMetadata,
      };

      const sourceTenantId = source.tenantId ?? undefined;
      const existing = await deps.findSkillBySourceIdentity({
        source: provider,
        upstreamId,
        tenantId: sourceTenantId,
      });

      let skill: ISkill & { _id: Types.ObjectId };
      if (existing && (existing.tenantId ?? undefined) === sourceTenantId) {
        const result = await deps.updateSkill({
          id: existing._id.toString(),
          expectedVersion: existing.version,
          update,
        });
        if (result.status === 'updated') {
          skill = result.skill;
        } else {
          throw new GenericSyncError('SKILL_CONFLICT', `Skill "${existing.name}" conflict during sync`);
        }
      } else {
        const created = await deps.createSkill({
          ...update,
          name: update.name ?? fallbackName,
          description: update.description ?? fallbackName,
          author: authorId,
          authorName,
          source: provider,
          tenantId: source.tenantId,
        });
        skill = created.skill;
      }

      await ensurePublicViewer(deps, skill._id);

      // Sync files
      const remotePaths = new Set<string>();
      let totalFileBytes = 0;
      for (const entry of discovered.files) {
        assertNotCancelled();
        const relativePath = getDiscoveredRelativePath(discovered, entry);
        if (!isSafeRelativePath(relativePath) || relativePath.toUpperCase() === 'SKILL.MD') {
          continue;
        }
        totalFileBytes += assertBlobSize(entry, relativePath);
        assertCumulativeSize(totalFileBytes);
        remotePaths.add(relativePath);

        const existingFile = await deps.getSkillFileByPath(skill._id, relativePath);
        if (existingFile && getSourceMetadataString(existingFile, 'blobSha') === entry.sha) {
          continue;
        }

        const fileBlobRef = makeBlobRef(provider, entry, commitSha);
        const buffer = await adapter.fetchBlob(fileBlobRef);
        assertNotCancelled();
        assertBufferSize(buffer, relativePath);

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
            provider,
            sourceId: source.id,
            upstreamId,
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
        counts.syncedFileCount++;
      }

      // Delete files no longer in remote
      const existingFiles = await deps.listSkillFiles(skill._id);
      for (const file of existingFiles) {
        if (remotePaths.has(file.relativePath)) {
          continue;
        }
        const result = await deps.deleteSkillFile(skill._id, file.relativePath);
        if (result.deleted) {
          counts.deletedFileCount++;
          if (deps.deleteFile) {
            await deps.deleteFile({
              filepath: file.filepath,
              source: file.source,
              storageKey: file.storageKey,
              storageRegion: file.storageRegion,
              user: file.author,
              tenantId: file.tenantId,
            }).catch((e) => logger.error(`[${provider}Sync] Failed to clean up file:`, e));
          }
        }
      }

      counts.syncedSkillCount++;
    }

    // Delete stale skills no longer in remote
    const currentSyncedSkills = await deps.listSkillsBySource({
      source: provider,
      sourceId: source.id,
    });
    const sourceTenantId = source.tenantId ?? undefined;
    for (const skill of currentSyncedSkills) {
      assertNotCancelled();
      if ((skill.tenantId ?? undefined) !== sourceTenantId) {
        continue;
      }
      const upstreamId = getSourceMetadataString(skill, 'upstreamId') ?? '';
      if (seenUpstreamIds.has(upstreamId)) {
        continue;
      }
      // Delete skill and its files
      const files = await deps.listSkillFiles(skill._id);
      for (const file of files) {
        if (deps.deleteFile) {
          await deps.deleteFile({
            filepath: file.filepath,
            source: file.source,
            storageKey: file.storageKey,
            storageRegion: file.storageRegion,
            user: file.author,
            tenantId: file.tenantId,
          }).catch((e) => logger.error(`[${provider}Sync] Failed to clean up stale file:`, e));
        }
      }
      await deps.deleteSkill(skill._id.toString());
      counts.deletedSkillCount++;
      counts.deletedFileCount += files.length;
    }

    return deps.upsertStatus(
      makeStatusInput({
        provider,
        source,
        status: 'succeeded',
        startedAt,
        finishedAt: new Date(),
        counts,
      }),
    );
  } catch (error) {
    const sanitized = sanitizeError(error);
    logger.error(`[${provider}Sync] Source "${source.id}" failed: ${sanitized.message}`);
    return deps.upsertStatus(
      makeStatusInput({
        provider,
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

function syncGenericSourceInTenantContext(params: {
  deps: GitHubSkillSyncDeps;
  adapter: GitRepoAdapter;
  provider: SkillSyncProvider;
  source: GenericSourceConfig;
  assertNotCancelled: AssertNotCancelled;
}): Promise<ISkillSyncStatus> {
  if (!params.source.tenantId) {
    return syncGenericSource(params);
  }
  return tenantStorage.run({ tenantId: params.source.tenantId }, async () =>
    syncGenericSource(params),
  );
}

export { syncGenericSourceInTenantContext };

/**
 * Called from the main runner's runOnce() to sync all non-GitHub providers.
 * Reads gitlab/bitbucket/azuredevops from the config and syncs each enabled source.
 */
export async function syncNonGitHubProviders(params: {
  deps: GitHubSkillSyncDeps;
  fetchFn: typeof fetch;
  assertNotCancelled: AssertNotCancelled;
}): Promise<ISkillSyncStatus[]> {
  const { deps, fetchFn, assertNotCancelled } = params;
  const config = await deps.getConfig();
  if (!config) {
    return [];
  }

  const results: ISkillSyncStatus[] = [];

  // GitLab
  if (config.gitlab?.enabled && config.gitlab.sources.length > 0) {
    for (const source of config.gitlab.sources) {
      assertNotCancelled();
      const token = await resolveToken(deps, 'gitlab', source);
      if (!token) {
        results.push(
          await deps.upsertStatus(
            makeStatusInput({
              provider: 'gitlab',
              source,
              status: 'failed',
              startedAt: new Date(),
              finishedAt: new Date(),
              errorCode: 'MISSING_CREDENTIAL',
              errorMessage: `Missing gitlab credential for source "${source.id}"`,
            }),
          ),
        );
        continue;
      }
      const { createRepoAdapter } = await import('./adapterFactory');
      const adapter = createRepoAdapter({
        provider: 'gitlab',
        token,
        projectId: source.projectId,
        baseUrl: source.baseUrl,
        fetchFn,
      });
      results.push(
        await syncGenericSourceInTenantContext({
          deps,
          adapter,
          provider: 'gitlab',
          source: {
            id: source.id,
            ref: source.ref,
            paths: source.paths,
            skillDiscoveryDepth: source.skillDiscoveryDepth,
            credentialKey: source.credentialKey,
            token: source.token,
            tenantId: source.tenantId,
          },
          assertNotCancelled,
        }),
      );
    }
  }

  // Bitbucket
  if (config.bitbucket?.enabled && config.bitbucket.sources.length > 0) {
    for (const source of config.bitbucket.sources) {
      assertNotCancelled();
      const token = await resolveToken(deps, 'bitbucket', source);
      if (!token) {
        results.push(
          await deps.upsertStatus(
            makeStatusInput({
              provider: 'bitbucket',
              source,
              status: 'failed',
              startedAt: new Date(),
              finishedAt: new Date(),
              errorCode: 'MISSING_CREDENTIAL',
              errorMessage: `Missing bitbucket credential for source "${source.id}"`,
            }),
          ),
        );
        continue;
      }
      const { createRepoAdapter } = await import('./adapterFactory');
      const adapter = createRepoAdapter({
        provider: 'bitbucket',
        token,
        workspace: source.workspace,
        repository: source.repository,
        fetchFn,
      });
      results.push(
        await syncGenericSourceInTenantContext({
          deps,
          adapter,
          provider: 'bitbucket',
          source: {
            id: source.id,
            ref: source.ref,
            paths: source.paths,
            skillDiscoveryDepth: source.skillDiscoveryDepth,
            credentialKey: source.credentialKey,
            token: source.token,
            tenantId: source.tenantId,
          },
          assertNotCancelled,
        }),
      );
    }
  }

  // Azure DevOps
  if (config.azuredevops?.enabled && config.azuredevops.sources.length > 0) {
    for (const source of config.azuredevops.sources) {
      assertNotCancelled();
      const token = await resolveToken(deps, 'azuredevops', source);
      if (!token) {
        results.push(
          await deps.upsertStatus(
            makeStatusInput({
              provider: 'azuredevops',
              source,
              status: 'failed',
              startedAt: new Date(),
              finishedAt: new Date(),
              errorCode: 'MISSING_CREDENTIAL',
              errorMessage: `Missing azuredevops credential for source "${source.id}"`,
            }),
          ),
        );
        continue;
      }
      const { createRepoAdapter } = await import('./adapterFactory');
      const adapter = createRepoAdapter({
        provider: 'azuredevops',
        token,
        organization: source.organization,
        project: source.project,
        repository: source.repository,
        baseUrl: source.baseUrl,
        fetchFn,
      });
      results.push(
        await syncGenericSourceInTenantContext({
          deps,
          adapter,
          provider: 'azuredevops',
          source: {
            id: source.id,
            ref: source.ref,
            paths: source.paths,
            skillDiscoveryDepth: source.skillDiscoveryDepth,
            credentialKey: source.credentialKey,
            token: source.token,
            tenantId: source.tenantId,
          },
          assertNotCancelled,
        }),
      );
    }
  }

  return results;
}
