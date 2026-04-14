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
}

export interface PrimeSkillFilesResult {
  session_id: string;
  files: Array<{ id: string; session_id: string; name: string }>;
}

/**
 * Uploads skill files (including SKILL.md from skill.body) to the code execution
 * environment in a single batch request. Returns session_id and file references
 * that can be stored as a CodeExecutionArtifact so ToolNode tracks the session.
 */
export async function primeSkillFiles(
  params: PrimeSkillFilesParams,
): Promise<PrimeSkillFilesResult | null> {
  const { skill, skillFiles, req, apiKey, getStrategyFunctions, batchUploadCodeEnvFiles } = params;

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
    return { session_id: result.session_id, files };
  } catch (error) {
    logger.error(
      `[primeSkillFiles] Batch upload failed for skill "${skill.name}":`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
