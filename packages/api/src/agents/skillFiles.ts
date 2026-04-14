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
  uploadCodeEnvFile: (params: {
    req: ServerRequest;
    stream: NodeJS.ReadableStream;
    filename: string;
    apiKey: string;
    entity_id?: string;
  }) => Promise<string>;
}

export interface PrimeSkillFilesResult {
  session_id: string;
  files: Array<{ id: string; session_id: string; name: string }>;
}

/**
 * Uploads skill files (including SKILL.md from skill.body) to the code execution
 * environment. Returns session_id and file references that can be stored as
 * a CodeExecutionArtifact so ToolNode tracks the session.
 *
 * Follows the same pattern as primeCodeFiles in api/server/services/Files/Code/process.js
 * but operates on skill files from the SkillFile collection rather than the File collection.
 */
export async function primeSkillFiles(
  params: PrimeSkillFilesParams,
): Promise<PrimeSkillFilesResult | null> {
  const { skill, skillFiles, req, apiKey, getStrategyFunctions, uploadCodeEnvFile } = params;

  const files: Array<{ id: string; session_id: string; name: string }> = [];
  let sessionId = '';

  // Upload SKILL.md from the skill body
  try {
    const bodyBuffer = Buffer.from(skill.body, 'utf-8');
    const bodyStream = Readable.from(bodyBuffer);
    const fileIdentifier = await uploadCodeEnvFile({
      req,
      stream: bodyStream,
      filename: 'SKILL.md',
      apiKey,
    });
    const [sid, fid] = fileIdentifier.split('/');
    sessionId = sid;
    files.push({ id: fid, session_id: sid, name: 'SKILL.md' });
  } catch (error) {
    logger.error(
      `[primeSkillFiles] Failed to upload SKILL.md for skill "${skill.name}":`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }

  // Upload each bundled file
  for (const file of skillFiles) {
    try {
      const strategy = getStrategyFunctions(file.source);
      if (!strategy.getDownloadStream) {
        logger.warn(
          `[primeSkillFiles] No download stream for file "${file.relativePath}" (source: ${file.source})`,
        );
        continue;
      }

      const stream = await strategy.getDownloadStream(req, file.filepath);
      const fileIdentifier = await uploadCodeEnvFile({
        req,
        stream,
        filename: file.relativePath,
        apiKey,
      });
      const [sid, fid] = fileIdentifier.split('/');
      if (!sessionId) {
        sessionId = sid;
      }
      files.push({ id: fid, session_id: sid, name: file.relativePath });
    } catch (error) {
      logger.error(
        `[primeSkillFiles] Failed to upload file "${file.relativePath}" for skill "${skill.name}":`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  if (!sessionId) {
    return null;
  }

  return { session_id: sessionId, files };
}
