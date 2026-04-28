import { Readable } from 'stream';
import { Constants } from '@librechat/agents';
import { logger } from '@librechat/data-schemas';
import type { ToolSessionMap, CodeSessionContext } from '@librechat/agents';
import type { Types } from 'mongoose';
import type { ServerRequest } from '~/types';
import { extractInvokedSkillsFromPayload } from './run';

export interface SkillFileRecord {
  relativePath: string;
  filename: string;
  filepath: string;
  source: string;
  bytes: number;
  codeEnvIdentifier?: string;
}

export interface PrimeSkillFilesParams {
  skill: { body: string; name: string; _id: Types.ObjectId | string };
  skillFiles: SkillFileRecord[];
  req: ServerRequest;
  getStrategyFunctions: (source: string) => {
    getDownloadStream?: (req: ServerRequest, filepath: string) => Promise<NodeJS.ReadableStream>;
    [key: string]: unknown;
  };
  batchUploadCodeEnvFiles: (params: {
    req: ServerRequest;
    files: Array<{ stream: NodeJS.ReadableStream; filename: string }>;
    entity_id?: string;
    /** When true, codeapi tags every file in the batch as infrastructure
     *  (read-only inputs that must never surface as generated artifacts,
     *  even if sandboxed code mutates the bytes on disk). */
    read_only?: boolean;
  }) => Promise<{
    session_id: string;
    files: Array<{ fileId: string; filename: string }>;
  }>;
  /** Checks if a code env file is still active. Returns lastModified timestamp or null. */
  getSessionInfo?: (fileIdentifier: string) => Promise<string | null>;
  /** 23-hour freshness check */
  checkIfActive?: (dateString: string) => boolean;
  /** Persists codeEnvIdentifier on skill files after upload */
  updateSkillFileCodeEnvIds?: (
    updates: Array<{
      skillId: Types.ObjectId | string;
      relativePath: string;
      codeEnvIdentifier: string;
    }>,
  ) => Promise<void>;
}

export interface PrimeSkillFilesResult {
  session_id: string;
  files: Array<{ id: string; session_id: string; name: string }>;
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

  // Check if ALL existing sessions are still active before reusing cached refs.
  // Files normally share one session, but a partial bulkWrite failure during
  // updateSkillFileCodeEnvIds can leave mixed session IDs. Checking every
  // distinct session prevents serving stale identifiers that 404 in code env.
  if (getSessionInfo && checkIfActive && skillFiles.length > 0) {
    // All files must have identifiers for the cache to be complete.
    // Any missing identifier means partial persistence — fall through to re-upload.
    const allHaveIds = skillFiles.every((sf) => sf.codeEnvIdentifier);
    if (allHaveIds) {
      const sessionIds = new Set(
        skillFiles.map((sf) => (sf.codeEnvIdentifier as string).split('?')[0].split('/')[0]),
      );

      try {
        const checkResults = await Promise.all(
          Array.from(sessionIds).map(async (sid) => {
            const representative = skillFiles.find((sf) =>
              sf.codeEnvIdentifier!.startsWith(`${sid}/`),
            );
            if (!representative) {
              return false;
            }
            const lastModified = await getSessionInfo(representative.codeEnvIdentifier!);
            return !!(lastModified && checkIfActive(lastModified));
          }),
        );
        const allActive = checkResults.every(Boolean);

        if (allActive) {
          const files: PrimeSkillFilesResult['files'] = [];
          for (const sf of skillFiles) {
            const [sid, fid] = (sf.codeEnvIdentifier as string).split('?')[0].split('/');
            files.push({ id: fid, session_id: sid, name: `${skill.name}/${sf.relativePath}` });
          }

          if (files.length > 0) {
            logger.debug(
              `[primeSkillFiles] All ${sessionIds.size} session(s) active for skill "${skill.name}", reusing ${files.length} files`,
            );
            return { session_id: files[0].session_id, files };
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
      entity_id: entityId,
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
    // for bash access but has no codeEnvIdentifier (cannot be cached). Omitting
    // it here keeps the fresh-upload and cache-hit code paths consistent.
    const files = result.files
      .filter((f) => !f.filename.endsWith('/SKILL.md'))
      .map((f) => ({
        id: f.fileId,
        session_id: result.session_id,
        name: f.filename,
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

    // Persist codeEnvIdentifiers on skill files (fire-and-forget)
    if (updateSkillFileCodeEnvIds) {
      const updates = result.files
        .filter((f) => !f.filename.endsWith('/SKILL.md'))
        .map((f) => ({
          skillId: skill._id,
          relativePath: f.filename.slice(f.filename.indexOf('/') + 1),
          codeEnvIdentifier: `${result.session_id}/${f.fileId}?entity_id=${entityId}`,
        }));
      if (updates.length > 0) {
        updateSkillFileCodeEnvIds(updates).catch((err: unknown) => {
          logger.warn(
            '[primeSkillFiles] Failed to persist codeEnvIdentifiers:',
            err instanceof Error ? err.message : err,
          );
        });
      }
    }

    return { session_id: result.session_id, files };
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
  ) => Promise<{ body: string; name: string; _id: Types.ObjectId; fileCount: number } | null>;
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
      const allFiles = fileListResults.flatMap((r) => r.files);
      const allFilesWithIds = allFiles.filter((f) => f.codeEnvIdentifier);

      // Only use cache when ALL files have identifiers (no partial persistence)
      if (allFilesWithIds.length > 0 && allFilesWithIds.length === allFiles.length) {
        const sessionIds = new Set(
          allFilesWithIds.map((f) => f.codeEnvIdentifier!.split('?')[0].split('/')[0]),
        );

        const checkResults = await Promise.all(
          Array.from(sessionIds).map(async (sid) => {
            const representative = allFilesWithIds.find((f) =>
              f.codeEnvIdentifier!.startsWith(`${sid}/`),
            );
            if (!representative) return true;
            try {
              const lastModified = await deps.getSessionInfo?.(representative.codeEnvIdentifier!);
              return !!(lastModified && deps.checkIfActive?.(lastModified));
            } catch {
              return false;
            }
          }),
        );
        const allActive = checkResults.every(Boolean);

        if (allActive) {
          const cachedFiles = fileListResults.flatMap((r) =>
            r.files
              .filter((f) => f.codeEnvIdentifier)
              .map((f) => {
                const [sid, fid] = (f.codeEnvIdentifier as string).split('?')[0].split('/');
                return { id: fid, name: `${r.skill.name}/${f.relativePath}`, session_id: sid };
              }),
          );
          if (cachedFiles.length > 0) {
            logger.debug(
              `[primeInvokedSkills] All ${sessionIds.size} session(s) active, reusing ${cachedFiles.length} cached files`,
            );
            sessions = new Map();
            // session_id is a representative value. ToolNode uses per-file
            // session_id from the files array (file.session_id ?? codeSession.session_id).
            sessions.set(Constants.EXECUTE_CODE, {
              session_id: cachedFiles[0].session_id,
              files: cachedFiles,
              lastUpdated: Date.now(),
            } satisfies CodeSessionContext);
            return { initialSessions: sessions, skills: skills.size > 0 ? skills : undefined };
          }
        }
      }
    }

    // Per-skill upload: each skill gets its own session with entity_id=skillId.
    // primeSkillFiles handles freshness caching per-skill, so only expired
    // skills re-upload. The code env handles mixed session_ids natively.
    const allPrimedFiles: Array<{ id: string; name: string; session_id: string }> = [];
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
          allPrimedFiles.push({ id: f.id, name: f.name, session_id: f.session_id });
        }
      } else if (r.status === 'rejected') {
        logger.warn('[primeInvokedSkills] Failed to prime skill files:', r.reason);
      }
    }

    if (allPrimedFiles.length > 0) {
      sessions = new Map();
      // session_id is a representative value (first skill's session). ToolNode
      // uses per-file session_id from the files array (file.session_id ??
      // codeSession.session_id), so mixed sessions work correctly.
      sessions.set(Constants.EXECUTE_CODE, {
        session_id: allPrimedFiles[0].session_id,
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
