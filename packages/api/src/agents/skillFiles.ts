import { Readable } from 'stream';
import { logger } from '@librechat/data-schemas';
import type { Types } from 'mongoose';
import type { ServerRequest } from '~/types';

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
