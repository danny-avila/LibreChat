import type { TFile, TAttachment, Assistant, Agent, TPlugin } from 'librechat-data-provider';
import type { TPluginMap } from '~/common';

/** Maps Attachments by `toolCallId` for quick lookup */
export function mapAttachments(attachments: Array<TAttachment | null | undefined>) {
  const attachmentMap: Record<string, TAttachment[] | undefined> = {};

  for (const attachment of attachments) {
    if (attachment === null || attachment === undefined) {
      continue;
    }
    const key = attachment.toolCallId ?? '';
    if (key.length === 0) {
      continue;
    }

    if (!attachmentMap[key]) {
      attachmentMap[key] = [];
    }

    attachmentMap[key].push(attachment);
  }

  return attachmentMap;
}

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

/** Maps Agents by `id` for quick lookup */
export function mapAgents(agents: Agent[]) {
  const agentMap = {} as Record<string, Agent>;

  for (const agent of agents) {
    agentMap[agent.id] = agent;
  }

  return agentMap;
}

/** Maps Plugins by `pluginKey` for quick lookup */
export function mapPlugins(plugins: TPlugin[]): TPluginMap {
  return plugins.reduce((acc, plugin) => {
    acc[plugin.pluginKey] = plugin;
    return acc;
  }, {} as TPluginMap);
}

/** Transform query data to object with list and map fields */
export const selectPlugins = (
  data: TPlugin[] | undefined,
): {
  list: TPlugin[];
  map: TPluginMap;
} => {
  if (!data) {
    return {
      list: [],
      map: {},
    };
  }

  return {
    list: data,
    map: mapPlugins(data),
  };
};

/** Transform array to TPlugin values */
export function processPlugins(tools: (string | TPlugin)[], allPlugins?: TPluginMap): TPlugin[] {
  return tools
    .map((tool: string | TPlugin) => {
      if (typeof tool === 'string') {
        return allPlugins?.[tool];
      }
      return tool;
    })
    .filter((tool: TPlugin | undefined): tool is TPlugin => tool !== undefined);
}
