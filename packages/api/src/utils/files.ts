import path from 'path';
import crypto from 'node:crypto';

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
