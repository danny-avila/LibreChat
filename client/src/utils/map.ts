import type { TFile, Assistant, TPlugin } from 'librechat-data-provider';

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

/** Maps Plugins by `pluginKey` for quick lookup */
export function mapPlugins(plugins: TPlugin[]): Record<string, TPlugin> {
  return plugins.reduce((acc, plugin) => {
    acc[plugin.pluginKey] = plugin;
    return acc;
  }, {} as Record<string, TPlugin>);
}
