import path from 'path';

export const GOVGPT_ROOT: string = (() => {
  const envRoot = process.env.GOVGPT_ROOT;
  if (envRoot && path.isAbsolute(envRoot)) {
    return envRoot;
  }

  // Fallback: assume current working directory is project root during local development
  return process.cwd();
})();

export const resolveFromRoot = (...segments: string[]): string => {
  return path.join(GOVGPT_ROOT, ...segments);
}; 