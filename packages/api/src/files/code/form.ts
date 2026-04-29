import * as path from 'path';

import type FormData from 'form-data';

export interface CodeEnvFileOptions {
  filename: string;
  filepath?: string;
}

/**
 * Uses `filepath` for nested names because `form-data` strips directories from
 * the bare string filename overload before codeapi can preserve them.
 */
export function getCodeEnvFileOptions(filename: string): CodeEnvFileOptions {
  const normalized = filename.replace(/\\/g, '/');
  const basename = path.posix.basename(normalized);

  if (normalized === basename) {
    return { filename };
  }

  return { filename: basename, filepath: normalized };
}

export function appendCodeEnvFile(
  form: FormData,
  stream: NodeJS.ReadableStream,
  filename: string,
): void {
  form.append('file', stream, getCodeEnvFileOptions(filename));
}
