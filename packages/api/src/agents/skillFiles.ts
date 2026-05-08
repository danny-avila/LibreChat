import { Readable } from 'stream';
import { Constants } from '@librechat/agents';
import { logger } from '@librechat/data-schemas';
import type { ToolSessionMap, CodeSessionContext } from '@librechat/agents';
import type { CodeEnvRef } from 'librechat-data-provider';
import type { Types } from 'mongoose';
import type { ServerRequest } from '~/types';
import { extractInvokedSkillsFromPayload } from './run';

export interface SkillFileRecord {
  relativePath: string;
  filename: string;
  filepath: string;
  source: string;
  bytes: number;
  codeEnvRef?: CodeEnvRef;
}

export interface PrimeSkillFilesParams {
  skill: {
    body: string;
    name: string;
    _id: Types.ObjectId | string;
    /** Monotonic counter on the skill record. Bumped on every edit
     *  (frontmatter / body / file upsert). Threaded into `codeEnvRef.version`
     *  so codeapi's sessionKey scopes the cache per-revision. */
    version: number;
  };
  skillFiles: SkillFileRecord[];
  req: ServerRequest;
  getStrategyFunctions: (source: string) => {
    getDownloadStream?: (req: ServerRequest, filepath: string) => Promise<NodeJS.ReadableStream>;
    [key: string]: unknown;
  };
  batchUploadCodeEnvFiles: (params: {
    req: ServerRequest;
    files: Array<{ stream: NodeJS.ReadableStream; filename: string }>;
    /** Resource kind that owns the batch's storage session. Drives codeapi's
     *  sessionKey derivation (`<tenant>:<kind>:<id>[:v:<version>]`). */
    kind: 'skill' | 'agent' | 'user';
    /** Resource id (skillId / agentId / userId). */
    id: string;
    /** Required when `kind === 'skill'`; forbidden otherwise. */
    version?: number;
    /** When true, codeapi tags every file in the batch as infrastructure
     *  (read-only inputs that must never surface as generated artifacts,
     *  even if sandboxed code mutates the bytes on disk). */
    read_only?: boolean;
  }) => Promise<{
    storage_session_id: string;
    files: Array<{ fileId: string; filename: string }>;
  }>;
  /** Checks if a code env file is still active. Returns lastModified timestamp or null. */
  getSessionInfo?: (ref: CodeEnvRef) => Promise<string | null>;
  /** 23-hour freshness check */
  checkIfActive?: (dateString: string) => boolean;
  /** Persists `codeEnvRef` on skill files after upload. Implementations
   *  warn-log on partial writes (matchedCount/modifiedCount mismatch)
   *  internally — caller can fire-and-forget without losing visibility. */
  updateSkillFileCodeEnvIds?: (
    updates: Array<{
      skillId: Types.ObjectId | string;
      relativePath: string;
      codeEnvRef: CodeEnvRef;
    }>,
  ) => Promise<{ matchedCount: number; modifiedCount: number } | void>;
}

export interface PrimeSkillFilesResult {
  /** Representative storage session id (first file's). */
  storage_session_id: string;
  files: Array<{
    /** Storage file id (the per-file uuid file_server returned at upload). */
    id: string;
    /** Resource id — the entity that owns the storage session. For skill
     *  files this is `skill._id.toString()`. Distinct from `id`; codeapi
     *  derives the sessionKey from `resource_id` (shared cache scope) but
     *  validates upload presence under `id` (per-file storage key). */
    resource_id: string;
    storage_session_id: string;
    name: string;
    kind: 'skill' | 'agent' | 'user';
    version?: number;
  }>;
}

/**
 * Uploads skill files to the code execution environment.
 *
 * Smart re-upload: if skill files have existing codeEnvIdentifiers,
 * checks session freshness first. If the session is still active,
 * returns cached references. Otherwise batch-uploads everything.
 *
 * After upload, persists new codeEnvIdentifiers on the SkillFile
 * documents for future freshness checks.
 */
export async function primeSkillFiles(
  params: PrimeSkillFilesParams,
): Promise<PrimeSkillFilesResult | null> {
  const {
    skill,
    skillFiles,
    req,
    getStrategyFunctions,
    batchUploadCodeEnvFiles,
    getSessionInfo,
    checkIfActive,
    updateSkillFileCodeEnvIds,
  } = params;

  /* Cache-hit path: every skillFile carries a `codeEnvRef` from the
   * previous prime. Check freshness against codeapi for every distinct
   * storage session; if all are still active, reuse without
   * re-uploading. The skill version is part of the ref — when the
   * skill is edited, the upsert clears the ref and forces a fresh
   * upload on the next prime. */
  if (getSessionInfo && checkIfActive && skillFiles.length > 0) {
    const allHaveRefs = skillFiles.every((sf) => sf.codeEnvRef !== undefined);
    if (allHaveRefs) {
      const refsBySession = new Map<string, CodeEnvRef>();
      for (const sf of skillFiles) {
        const ref = sf.codeEnvRef;
        if (ref && !refsBySession.has(ref.storage_session_id)) {
          refsBySession.set(ref.storage_session_id, ref);
        }
      }

      try {
        const checkResults = await Promise.all(
          Array.from(refsBySession.values()).map(async (ref) => {
            const lastModified = await getSessionInfo(ref);
            return !!(lastModified && checkIfActive(lastModified));
          }),
        );
        const allActive = checkResults.every(Boolean);

        if (allActive) {
          const files: PrimeSkillFilesResult['files'] = [];
          for (const sf of skillFiles) {
            const ref = sf.codeEnvRef;
            if (!ref) continue;
            /* Cache-hit refs already carry resource identity (kind / id /
             * version) — pull them through so the artifact emitted by
             * `handle_skill` and forwarded to `_injected_files` includes
             * `resource_id`. Without this the next /exec sends
             * `resource_id: undefined` and codeapi 400s. The discriminated
             * union pins `version` to the skill branch only — destructure
             * before the spread so TS accepts the conditional pull. */
            files.push({
              id: ref.file_id,
              resource_id: ref.id,
              storage_session_id: ref.storage_session_id,
              name: `${skill.name}/${sf.relativePath}`,
              kind: ref.kind,
              ...(ref.kind === 'skill' ? { version: ref.version } : {}),
            });
          }

          if (files.length > 0) {
            logger.debug(
              `[primeSkillFiles] All ${refsBySession.size} session(s) active for skill "${skill.name}", reusing ${files.length} files`,
            );
            return { storage_session_id: files[0].storage_session_id, files };
          }
        }
      } catch {
        // Session check failed — fall through to re-upload
      }
    }
  }

  // Collect streams for batch upload
  const filesToUpload: Array<{ stream: NodeJS.ReadableStream; filename: string }> = [];

  // SKILL.md from the skill body
  const bodyBuffer = Buffer.from(skill.body, 'utf-8');
  filesToUpload.push({ stream: Readable.from(bodyBuffer), filename: `${skill.name}/SKILL.md` });

  // Bundled files from storage (parallel stream acquisition)
  const streamResults = await Promise.allSettled(
    skillFiles.map(async (file) => {
      const strategy = getStrategyFunctions(file.source);
      if (!strategy.getDownloadStream) {
        logger.warn(
          `[primeSkillFiles] No download stream for "${file.relativePath}" (source: ${file.source})`,
        );
        return null;
      }
      const stream = await strategy.getDownloadStream(req, file.filepath);
      return { stream, filename: `${skill.name}/${file.relativePath}` };
    }),
  );
  for (const result of streamResults) {
    if (result.status === 'fulfilled' && result.value) {
      filesToUpload.push(result.value);
    } else if (result.status === 'rejected') {
      logger.error('[primeSkillFiles] Failed to get stream:', result.reason);
    }
  }

  if (filesToUpload.length === 0) {
    return null;
  }

  try {
    const entityId = skill._id.toString();
    const result = await batchUploadCodeEnvFiles({
      req,
      files: filesToUpload,
      /* Resource identity for codeapi's sessionKey: skill files share
       * cross-user-within-tenant under `<tenant>:skill:<id>:v:<version>`.
       * Bumping `skill.version` on edit naturally invalidates the prior
       * cache entry under the new sessionKey. */
      kind: 'skill',
      id: entityId,
      version: skill.version,
      /* Skill files are infrastructure: SKILL.md + bundled scripts/schemas/
       * docs that the agent reads but should never edit. Tag the upload as
       * read-only so codeapi seals the inputs (chmod 444 in-sandbox) and
       * walker echoes the original refs as `inherited: true` even if some
       * sandboxed code path mutates bytes on disk. Without this, modified
       * skill files surface as ghost generated artifacts the user has no
       * authority to download. */
      read_only: true,
    });
    // Exclude SKILL.md from the returned files array — it is uploaded to disk
    // for bash access but has no codeEnvRef (cannot be cached). Omitting it
    // here keeps the fresh-upload and cache-hit code paths consistent.
    const files: PrimeSkillFilesResult['files'] = result.files
      .filter((f) => !f.filename.endsWith('/SKILL.md'))
      .map((f) => ({
        id: f.fileId,
        /* `resource_id` is the skill `_id` (the entity codeapi scopes
         * the sessionKey on). Distinct from `id` (the per-file storage
         * uuid) — both are required on the request. */
        resource_id: entityId,
        storage_session_id: result.storage_session_id,
        name: f.filename,
        kind: 'skill',
        version: skill.version,
      }));

    // Treat partial upload failures as a priming failure — missing bundled
    // files cause follow-up bash/read calls to fail at runtime with missing paths.
    const expectedCount = filesToUpload.filter((f) => !f.filename.endsWith('/SKILL.md')).length;
    if (files.length < expectedCount) {
      const uploadedNames = new Set(result.files.map((f) => f.filename));
      const missingNames = filesToUpload
        .filter((f) => !f.filename.endsWith('/SKILL.md') && !uploadedNames.has(f.filename))
        .map((f) => f.filename);
      logger.error(
        `[primeSkillFiles] Partial upload failure for skill "${skill.name}": ${missingNames.length} file(s) missing: ${missingNames.join(', ')}`,
      );
      return null;
    }

    /**
     * Persist codeEnvRefs on skill files. Awaited (not fire-and-forget)
     * so the next prime — which can start within milliseconds when
     * many users hit the same skill concurrently — sees the cache
     * pointer instead of racing the read against an in-flight write.
     * Without the await, a fire-and-forget under concurrency stays in
     * cache-miss steady-state for the duration of the burst (each
     * user's prime reads stale, re-uploads, then fires its own forget
     * that the next user also misses). Latency cost is ~10–50ms on
     * the prime that does the upload; subsequent primes save an entire
     * batch upload. Failures don't fail the prime — the file refs
     * returned to the caller are still valid.
     */
    if (updateSkillFileCodeEnvIds) {
      const updates = result.files
        .filter((f) => !f.filename.endsWith('/SKILL.md'))
        .map((f) => {
          const ref: CodeEnvRef = {
            kind: 'skill',
            id: entityId,
            storage_session_id: result.storage_session_id,
            file_id: f.fileId,
            version: skill.version,
          };
          return {
            skillId: skill._id,
            relativePath: f.filename.slice(f.filename.indexOf('/') + 1),
            codeEnvRef: ref,
          };
        });
      if (updates.length > 0) {
        try {
          await updateSkillFileCodeEnvIds(updates);
        } catch (err: unknown) {
          logger.warn(
            '[primeSkillFiles] Failed to persist codeEnvRefs:',
            err instanceof Error ? err.message : err,
          );
        }
      }
    }

    return { storage_session_id: result.storage_session_id, files };
  } catch (error) {
    logger.error(
      `[primeSkillFiles] Batch upload failed for skill "${skill.name}":`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export interface PrimeInvokedSkillsDeps {
  req: ServerRequest;
  /** Raw message payload (before formatAgentMessages). Used to extract invoked skill names. */
  payload: Array<Partial<{ role: string; content: unknown }>>;
  accessibleSkillIds: Types.ObjectId[];
  /** `execute_code` capability flag for the run. When false, the batch-upload
   *  path is skipped entirely — skill bodies still reconstruct for history
   *  rebuilds, but no sandbox traffic is generated. */
  codeEnvAvailable: boolean;
  getSkillByName: (
    name: string,
    accessibleIds: Types.ObjectId[],
  ) => Promise<{
    body: string;
    name: string;
    _id: Types.ObjectId;
    version: number;
    fileCount: number;
  } | null>;
  listSkillFiles: (skillId: Types.ObjectId | string) => Promise<SkillFileRecord[]>;
  getStrategyFunctions: PrimeSkillFilesParams['getStrategyFunctions'];
  batchUploadCodeEnvFiles: PrimeSkillFilesParams['batchUploadCodeEnvFiles'];
  getSessionInfo?: PrimeSkillFilesParams['getSessionInfo'];
  checkIfActive?: PrimeSkillFilesParams['checkIfActive'];
  updateSkillFileCodeEnvIds?: PrimeSkillFilesParams['updateSkillFileCodeEnvIds'];
}

export interface PrimeInvokedSkillsResult {
  initialSessions?: ToolSessionMap;
  /** Pre-resolved skill bodies keyed by skill name. Passed to formatAgentMessages
   *  so it can reconstruct HumanMessages at the right position in the message sequence. */
  skills?: Map<string, string>;
}

/**
 * Extracts previously invoked skills from message history, resolves their
 * bodies from DB, and re-primes their files to the code env.
 *
 * Returns:
 * - initialSessions: seeds Graph.sessions so ToolNode injects session_id into bash/code tools
 * - skills: Map of skillName → body for formatAgentMessages to reconstruct HumanMessages
 */
export async function primeInvokedSkills(
  deps: PrimeInvokedSkillsDeps,
): Promise<PrimeInvokedSkillsResult> {
  if (!deps.payload?.length || !deps.accessibleSkillIds?.length) {
    return {};
  }

  const invokedSkills = extractInvokedSkillsFromPayload(deps.payload);
  if (invokedSkills.size === 0) {
    return {};
  }

  const skills = new Map<string, string>();

  // Phase 1: Resolve all skills in parallel (DB lookups)
  const resolveResults = await Promise.allSettled(
    Array.from(invokedSkills).map(async (skillName) => {
      const skill = await deps.getSkillByName(skillName, deps.accessibleSkillIds);
      return skill ?? undefined;
    }),
  );

  const resolvedSkills: Array<{
    body: string;
    name: string;
    _id: Types.ObjectId;
    version: number;
    fileCount: number;
  }> = [];
  for (const r of resolveResults) {
    if (r.status === 'fulfilled' && r.value) {
      skills.set(r.value.name, r.value.body);
      resolvedSkills.push(r.value);
    } else if (r.status === 'rejected') {
      logger.warn('[primeInvokedSkills] Skill resolution failed:', r.reason);
    }
  }

  // Phase 2: Single batch upload for ALL skills' files (shared session)
  let sessions: ToolSessionMap | undefined;
  const skillsWithFiles = resolvedSkills.filter((s) => s.fileCount > 0);

  if (deps.codeEnvAvailable && skillsWithFiles.length > 0) {
    // Parallel file list lookups (R2 fix)
    const fileListResults = await Promise.all(
      skillsWithFiles.map(async (skill) => ({
        skill,
        files: await deps.listSkillFiles(skill._id),
      })),
    );

    // Session freshness check: the code env natively handles mixed sessions
    // (each file carries its own session_id, fetched independently). We check
    // ALL distinct sessions for freshness. If all are active, return cached
    // references with zero re-uploads. If any expired, re-upload everything.
    if (deps.getSessionInfo && deps.checkIfActive) {
      const allResolved = fileListResults.flatMap((r) =>
        r.files.map((f) => ({ skillName: r.skill.name, file: f, ref: f.codeEnvRef })),
      );
      const resolvedWithRef = allResolved.filter((x) => x.ref !== undefined);

      // Only use cache when ALL files have refs (no partial persistence)
      if (resolvedWithRef.length > 0 && resolvedWithRef.length === allResolved.length) {
        const refsBySession = new Map<string, CodeEnvRef>();
        for (const { ref } of resolvedWithRef) {
          if (ref && !refsBySession.has(ref.storage_session_id)) {
            refsBySession.set(ref.storage_session_id, ref);
          }
        }

        const checkResults = await Promise.all(
          Array.from(refsBySession.values()).map(async (ref) => {
            try {
              const lastModified = await deps.getSessionInfo?.(ref);
              return !!(lastModified && deps.checkIfActive?.(lastModified));
            } catch {
              return false;
            }
          }),
        );
        const allActive = checkResults.every(Boolean);

        if (allActive) {
          /* `id` is the STORAGE file_id (the per-file uuid the
           * file_server registered the upload under); `resource_id`
           * is the entity that owns the storage session — the
           * skill's `_id` here. codeapi's auth layer needs both:
           * `id` for the upload-existence check, `resource_id` for
           * sessionKey re-derivation (`<tenant>:skill:<resource_id>:v:<version>`).
           * Conflating them sent the storage nanoid through the
           * sessionKey switch and 403'd every shared-kind /exec. */
          const cachedFiles = resolvedWithRef.map(({ skillName, file, ref }) => ({
            id: ref!.file_id,
            resource_id: ref!.id,
            name: `${skillName}/${file.relativePath}`,
            storage_session_id: ref!.storage_session_id,
            kind: ref!.kind,
            ...(ref!.kind === 'skill' ? { version: ref!.version } : {}),
          }));
          if (cachedFiles.length > 0) {
            logger.debug(
              `[primeInvokedSkills] All ${refsBySession.size} session(s) active, reusing ${cachedFiles.length} cached files`,
            );
            sessions = new Map();
            /* `session_id` at the top of CodeSessionContext is the
             * (representative) execution session — ToolNode reads it
             * for continuity. Per-file storage is on each
             * `files[i].storage_session_id`. */
            sessions.set(Constants.EXECUTE_CODE, {
              session_id: cachedFiles[0].storage_session_id,
              files: cachedFiles,
              lastUpdated: Date.now(),
            } satisfies CodeSessionContext);
            return { initialSessions: sessions, skills: skills.size > 0 ? skills : undefined };
          }
        }
      }
    }

    // Per-skill upload: each skill gets its own storage session keyed
    // by `(kind: 'skill', id: skillId, version: skill.version)`.
    // primeSkillFiles handles freshness caching per-skill, so only
    // expired skills re-upload. CodeAPI handles mixed
    // storage_session_ids natively.
    const allPrimedFiles: Array<{
      id: string;
      resource_id: string;
      name: string;
      storage_session_id: string;
      kind: 'skill';
      version: number;
    }> = [];
    const primeResults = await Promise.allSettled(
      fileListResults.map(async ({ skill, files }) => {
        const result = await primeSkillFiles({
          skill,
          skillFiles: files,
          req: deps.req,
          getStrategyFunctions: deps.getStrategyFunctions,
          batchUploadCodeEnvFiles: deps.batchUploadCodeEnvFiles,
          getSessionInfo: deps.getSessionInfo,
          checkIfActive: deps.checkIfActive,
          updateSkillFileCodeEnvIds: deps.updateSkillFileCodeEnvIds,
        });
        return { skill, result };
      }),
    );
    for (const r of primeResults) {
      if (r.status === 'fulfilled' && r.value.result) {
        for (const f of r.value.result.files) {
          allPrimedFiles.push({
            id: f.id,
            /* `resource_id` is the skill's `_id` — drives codeapi's
             * sessionKey re-derivation. See cachedFiles above for the
             * full id-vs-resource_id rationale. */
            resource_id: r.value.skill._id.toString(),
            name: f.name,
            storage_session_id: f.storage_session_id,
            kind: 'skill',
            version: r.value.skill.version,
          });
        }
      } else if (r.status === 'rejected') {
        logger.warn('[primeInvokedSkills] Failed to prime skill files:', r.reason);
      }
    }

    if (allPrimedFiles.length > 0) {
      sessions = new Map();
      /* `session_id` at the top of CodeSessionContext is the
       * (representative) execution session. Per-file storage is on
       * each file's `storage_session_id`. */
      sessions.set(Constants.EXECUTE_CODE, {
        session_id: allPrimedFiles[0].storage_session_id,
        files: allPrimedFiles,
        lastUpdated: Date.now(),
      } satisfies CodeSessionContext);
    }
  }

  return {
    initialSessions: sessions,
    skills: skills.size > 0 ? skills : undefined,
  };
}
