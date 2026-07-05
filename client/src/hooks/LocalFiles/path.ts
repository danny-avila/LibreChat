export class LocalFilePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalFilePathError';
  }
}

export function parseRelativePath(path: string): string[] {
  const trimmed = path.trim();
  if (!trimmed) {
    return [];
  }

  const normalized = trimmed.replace(/\\/g, '/');
  if (normalized.startsWith('/')) {
    throw new LocalFilePathError('Absolute paths are not allowed');
  }

  const segments = normalized.split('/').filter((segment) => segment.length > 0);
  const resolved: string[] = [];

  for (const segment of segments) {
    if (segment === '..') {
      throw new LocalFilePathError('Path traversal is not allowed');
    }
    if (segment === '.') {
      continue;
    }
    if (segment.includes('\0')) {
      throw new LocalFilePathError('Invalid path segment');
    }
    resolved.push(segment);
  }

  return resolved;
}

export function joinRelativePath(segments: string[]): string {
  return segments.join('/');
}
