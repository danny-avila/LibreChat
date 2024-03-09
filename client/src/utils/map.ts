import type { TFile, Assistant } from 'librechat-data-provider';

/** Maps Files by `file_id` for quick lookup */
export function mapFiles(files: TFile[]) {
  const fileMap = {} as Record<string, TFile>;

  for (const file of files) {
    fileMap[file.file_id] = file;
  }

  return fileMap;
}

/** Maps Assistants by `id` for quick lookup */
export function mapAssistants(assistants: Assistant[]) {
  const assistantMap = {} as Record<string, Assistant>;

  for (const assistant of assistants) {
    assistantMap[assistant.id] = assistant;
  }

  return assistantMap;
}
