import path from 'path';
import crypto from 'node:crypto';
import { createReadStream } from 'fs';
import { readFile, stat } from 'fs/promises';

/**
 * Sanitize a filename by removing any directory components, replacing non-alphanumeric characters
 * @param inputName
 */
export function sanitizeFilename(inputName: string): string {
  // Remove any directory components
  let name = path.basename(inputName);

  // Replace any non-alphanumeric characters except for '.' and '-'
  name = name.replace(/[^a-zA-Z0-9.-]/g, '_');

  // Ensure the name doesn't start with a dot (hidden file in Unix-like systems)
  if (name.startsWith('.') || name === '') {
    name = '_' + name;
  }

  // Limit the length of the filename
  const MAX_LENGTH = 255;
  if (name.length > MAX_LENGTH) {
    const ext = path.extname(name);
    const nameWithoutExt = path.basename(name, ext);
    name =
      nameWithoutExt.slice(0, MAX_LENGTH - ext.length - 7) +
      '-' +
      crypto.randomBytes(3).toString('hex') +
      ext;
  }

  return name;
}

/**
 * Options for reading files
 */
export interface ReadFileOptions {
  encoding?: BufferEncoding;
  /** Size threshold in bytes. Files larger than this will be streamed. Default: 10MB */
  streamThreshold?: number;
  /** Size of chunks when streaming. Default: 64KB */
  highWaterMark?: number;
  /** File size in bytes if known (e.g. from multer). Avoids extra stat() call. */
  fileSize?: number;
}

/**
 * Result from reading a file
 */
export interface ReadFileResult<T> {
  content: T;
  bytes: number;
}

/**
 * Reads a file asynchronously. Uses streaming for large files to avoid memory issues.
 *
 * @param filePath - Path to the file to read
 * @param options - Options for reading the file
 * @returns Promise resolving to the file contents and size
 * @throws Error if the file cannot be read
 */
export async function readFileAsString(
  filePath: string,
  options: ReadFileOptions = {},
): Promise<ReadFileResult<string>> {
  const {
    encoding = 'utf8',
    streamThreshold = 10 * 1024 * 1024, // 10MB
    highWaterMark = 64 * 1024, // 64KB
    fileSize,
  } = options;

  // Get file size if not provided
  const bytes = fileSize ?? (await stat(filePath)).size;

  // For large files, use streaming to avoid memory issues
  if (bytes > streamThreshold) {
    const chunks: string[] = [];
    const stream = createReadStream(filePath, {
      encoding,
      highWaterMark,
    });

    for await (const chunk of stream) {
      chunks.push(chunk as string);
    }

    return { content: chunks.join(''), bytes };
  }

  // For smaller files, read directly
  const content = await readFile(filePath, encoding);
  return { content, bytes };
}

/**
 * Reads a file as a Buffer asynchronously. Uses streaming for large files.
 *
 * @param filePath - Path to the file to read
 * @param options - Options for reading the file
 * @returns Promise resolving to the file contents and size
 * @throws Error if the file cannot be read
 */
export async function readFileAsBuffer(
  filePath: string,
  options: Omit<ReadFileOptions, 'encoding'> = {},
): Promise<ReadFileResult<Buffer>> {
  const {
    streamThreshold = 10 * 1024 * 1024, // 10MB
    highWaterMark = 64 * 1024, // 64KB
    fileSize,
  } = options;

  // Get file size if not provided
  const bytes = fileSize ?? (await stat(filePath)).size;

  // For large files, use streaming to avoid memory issues
  if (bytes > streamThreshold) {
    const chunks: Buffer[] = [];
    const stream = createReadStream(filePath, {
      highWaterMark,
    });

    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }

    return { content: Buffer.concat(chunks), bytes };
  }

  // For smaller files, read directly
  const content = await readFile(filePath);
  return { content, bytes };
}

/**
 * Reads a JSON file asynchronously
 *
 * @param filePath - Path to the JSON file to read
 * @param options - Options for reading the file
 * @returns Promise resolving to the parsed JSON object
 * @throws Error if the file cannot be read or parsed
 */
export async function readJsonFile<T = unknown>(
  filePath: string,
  options: Omit<ReadFileOptions, 'encoding'> = {},
): Promise<T> {
  const { content } = await readFileAsString(filePath, { ...options, encoding: 'utf8' });
  return JSON.parse(content);
}
