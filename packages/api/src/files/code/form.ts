import * as path from 'path';

import type FormData from 'form-data';

export interface CodeEnvFileOptions {
  filename: string;
  filepath?: string;
}

const CODE_ENV_FILEPATH_CHARS = /^[a-zA-Z0-9._\-/]+$/;

function isSafeCodeEnvFilepath(filepath: string): boolean {
  if (!filepath || filepath.startsWith('/') || !CODE_ENV_FILEPATH_CHARS.test(filepath)) {
    return false;
  }

  const segments = filepath.split('/');
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function getCodeEnvBasename(filepath: string): string {
  const basename = path.posix.basename(filepath);

  if (!basename || basename === '.' || basename === '..') {
    return 'file';
  }

  return basename;
}

/**
 * Uses `filepath` for nested names because `form-data` strips directories from
 * the bare string filename overload before codeapi can preserve safe paths.
 */
export function getCodeEnvFileOptions(filename: string): CodeEnvFileOptions {
  const normalized = filename.replace(/\\/g, '/');
  const basename = getCodeEnvBasename(normalized);

  if (normalized === filename && filename === basename) {
    return { filename };
  }

  if (!isSafeCodeEnvFilepath(normalized)) {
    return { filename: basename };
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
