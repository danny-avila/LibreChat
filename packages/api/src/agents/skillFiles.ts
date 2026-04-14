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
  apiKey: string;
  getStrategyFunctions: (source: string) => {
    getDownloadStream?: (req: ServerRequest, filepath: string) => Promise<NodeJS.ReadableStream>;
    [key: string]: unknown;
  };
  batchUploadCodeEnvFiles: (params: {
    req: ServerRequest;
    files: Array<{ stream: NodeJS.ReadableStream; filename: string }>;
    apiKey: string;
    entity_id?: string;
  }) => Promise<{
    session_id: string;
    files: Array<{ fileId: string; filename: string }>;
  }>;
  /** Checks if a code env file is still active. Returns lastModified timestamp or null. */
  getSessionInfo?: (fileIdentifier: string, apiKey: string) => Promise<string | null>;
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
    apiKey,
    getStrategyFunctions,
    batchUploadCodeEnvFiles,
    getSessionInfo,
    checkIfActive,
    updateSkillFileCodeEnvIds,
  } = params;

  // Check if existing session is still active (all files share one session)
  if (getSessionInfo && checkIfActive && skillFiles.length > 0) {
    const firstWithId = skillFiles.find((f) => f.codeEnvIdentifier);
    if (firstWithId?.codeEnvIdentifier) {
      try {
        const lastModified = await getSessionInfo(firstWithId.codeEnvIdentifier, apiKey);
        if (lastModified && checkIfActive(lastModified)) {
          // Session still active — return cached references
          const files: PrimeSkillFilesResult['files'] = [];
          const sessionId = firstWithId.codeEnvIdentifier.split('/')[0];

          // SKILL.md doesn't have a codeEnvIdentifier; find it by name convention
          // (it was uploaded with the batch and shares the session)
          for (const sf of skillFiles) {
            if (sf.codeEnvIdentifier) {
              const [sid, fid] = sf.codeEnvIdentifier.split('/');
              files.push({ id: fid, session_id: sid, name: sf.relativePath });
            }
          }

          if (files.length > 0) {
            logger.debug(
              `[primeSkillFiles] Session still active for skill "${skill.name}", reusing ${files.length} files`,
            );
            return { session_id: sessionId, files };
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
  filesToUpload.push({ stream: Readable.from(bodyBuffer), filename: 'SKILL.md' });

  // Bundled files from storage
  for (const file of skillFiles) {
    try {
      const strategy = getStrategyFunctions(file.source);
      if (!strategy.getDownloadStream) {
        logger.warn(
          `[primeSkillFiles] No download stream for "${file.relativePath}" (source: ${file.source})`,
        );
        continue;
      }
      const stream = await strategy.getDownloadStream(req, file.filepath);
      filesToUpload.push({ stream, filename: file.relativePath });
    } catch (error) {
      logger.error(
        `[primeSkillFiles] Failed to get stream for "${file.relativePath}":`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  if (filesToUpload.length === 0) {
    return null;
  }

  try {
    const result = await batchUploadCodeEnvFiles({ req, files: filesToUpload, apiKey });
    const files = result.files.map((f) => ({
      id: f.fileId,
      session_id: result.session_id,
      name: f.filename,
    }));

    // Persist codeEnvIdentifiers on skill files (fire-and-forget)
    if (updateSkillFileCodeEnvIds) {
      const updates = result.files
        .filter((f) => f.filename !== 'SKILL.md')
        .map((f) => ({
          skillId: skill._id,
          relativePath: f.filename,
          codeEnvIdentifier: `${result.session_id}/${f.fileId}`,
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
  apiKey: string;
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
  skillBodies?: Map<string, string>;
}

/**
 * Extracts previously invoked skills from message history, resolves their
 * bodies from DB, and re-primes their files to the code env.
 *
 * Returns:
 * - initialSessions: seeds Graph.sessions so ToolNode injects session_id into bash/code tools
 * - skillBodies: Map of skillName → body for formatAgentMessages to reconstruct HumanMessages
 */
export async function primeInvokedSkills(
  deps: PrimeInvokedSkillsDeps,
): Promise<PrimeInvokedSkillsResult> {
  const invokedSkills = extractInvokedSkillsFromPayload(deps.payload);
  if (invokedSkills.size === 0) {
    return {};
  }

  const skillBodies = new Map<string, string>();
  let sessions: ToolSessionMap | undefined;

  for (const skillName of invokedSkills) {
    try {
      const skill = await deps.getSkillByName(skillName, deps.accessibleSkillIds);
      if (!skill) {
        continue;
      }

      skillBodies.set(skill.name, skill.body);

      // Re-prime files for multi-file skills
      if (skill.fileCount > 0) {
        const skillFiles = await deps.listSkillFiles(skill._id);
        const result = await primeSkillFiles({
          skill,
          skillFiles,
          req: deps.req,
          apiKey: deps.apiKey,
          getStrategyFunctions: deps.getStrategyFunctions,
          batchUploadCodeEnvFiles: deps.batchUploadCodeEnvFiles,
          getSessionInfo: deps.getSessionInfo,
          checkIfActive: deps.checkIfActive,
          updateSkillFileCodeEnvIds: deps.updateSkillFileCodeEnvIds,
        });

        if (result) {
          if (!sessions) {
            sessions = new Map();
          }
          const sessionCtx: CodeSessionContext = {
            session_id: result.session_id,
            files: result.files.map((f) => ({
              id: f.id,
              name: f.name,
              session_id: f.session_id,
            })),
            lastUpdated: Date.now(),
          };
          sessions.set(Constants.EXECUTE_CODE, sessionCtx);
        }
      }
    } catch (err) {
      logger.warn(
        `[primeInvokedSkills] Failed for skill "${skillName}":`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return {
    initialSessions: sessions,
    skillBodies: skillBodies.size > 0 ? skillBodies : undefined,
  };
}
