export type ImportLimits = {
  maxZipBytes: number;
  maxDecompressedBytes: number;
  maxEntries: number;
  maxSingleFileBytes: number;
};

export const DEFAULT_SKILL_IMPORT_LIMITS: ImportLimits = {
  maxZipBytes: 50 * 1024 * 1024,
  maxDecompressedBytes: 500 * 1024 * 1024,
  maxEntries: 500,
  maxSingleFileBytes: 10 * 1024 * 1024,
};
