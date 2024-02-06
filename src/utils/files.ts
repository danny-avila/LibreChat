import type { TFile } from 'librechat-data-provider';

/** Maps Files by `file_id` for quick lookup */
export function mapFiles(files: TFile[]) {
  const fileMap = {} as Record<string, TFile>;

  for (const file of files) {
    fileMap[file.file_id] = file;
  }

  return fileMap;
}
