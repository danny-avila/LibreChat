import path from 'path';

/**
 * Determine the log directory in a cross-compatible way.
 * Priority:
 * 1. BIZU_LOG_DIR environment variable
 * 2. If running within Bizu monorepo (when cwd ends with /api), use api/logs
 * 3. If api/logs exists relative to cwd, use that (for running from project root)
 * 4. Otherwise, use logs directory relative to process.cwd()
 *
 * This avoids using __dirname which is not available in ESM modules
 */
export const getLogDirectory = (): string => {
  if (process.env.BIZU_LOG_DIR) {
    return process.env.BIZU_LOG_DIR;
  }

  const cwd = process.cwd();

  // Check if we're running from within the api directory
  if (cwd.endsWith('/api') || cwd.endsWith('\\api')) {
    return path.join(cwd, 'logs');
  }

  // Check if api/logs exists relative to current directory (running from project root)
  // We'll just use the path and let the file system create it if needed
  const apiLogsPath = path.join(cwd, 'api', 'logs');

  // For Bizu project structure, use api/logs
  // For external consumers, they should set BIZU_LOG_DIR
  if (cwd.includes('Bizu')) {
    return apiLogsPath;
  }

  // Default to logs directory relative to current working directory
  return path.join(cwd, 'logs');
};
