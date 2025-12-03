import type * as t from 'librechat-data-provider';
import type { TPluginMap } from '~/common';

/** Maps Attachments by `toolCallId` for quick lookup */
export function mapAttachments(attachments: Array<t.TAttachment | null | undefined>) {
  const attachmentMap: Record<string, t.TAttachment[] | undefined> = {};

  for (const attachment of attachments) {
    if (attachment === null || attachment === undefined) {
      continue;
    }
    const key = attachment.toolCallId || '';
    if (key.length === 0) {
      continue;
    }

    if (!attachmentMap[key]) {
      attachmentMap[key] = [];
    }

    attachmentMap[key]?.push(attachment);
  }

  return attachmentMap;
}

/** Maps Files by `file_id` for quick lookup */
export function mapFiles(files: t.TFile[]) {
  const fileMap = {} as Record<string, t.TFile>;

  for (const file of files) {
    fileMap[file.file_id] = file;
  }

  return fileMap;
}

/** Maps Assistants by `id` for quick lookup */
export function mapAssistants(assistants: t.Assistant[]) {
  const assistantMap = {} as Record<string, t.Assistant>;

  for (const assistant of assistants) {
    assistantMap[assistant.id] = assistant;
  }

  return assistantMap;
}

/** Maps Agents by `id` for quick lookup */
export function mapAgents(agents: t.Agent[]) {
  const agentsMap = {} as Record<string, t.Agent>;

  for (const agent of agents) {
    agentsMap[agent.id] = agent;
  }

  return agentsMap;
}

/** Maps Plugins by `pluginKey` for quick lookup */
export function mapPlugins(plugins: t.TPlugin[]): TPluginMap {
  return plugins.reduce((acc, plugin) => {
    acc[plugin.pluginKey] = plugin;
    return acc;
  }, {} as TPluginMap);
}

/** Transform query data to object with list and map fields */
export const selectPlugins = (
  data: t.TPlugin[] | undefined,
): {
  list: t.TPlugin[];
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
export function processPlugins(
  tools: (string | t.TPlugin)[],
  allPlugins?: TPluginMap,
): t.TPlugin[] {
  return tools
    .map((tool: string | t.TPlugin) => {
      if (typeof tool === 'string') {
        return allPlugins?.[tool];
      }
      return tool;
    })
    .filter((tool: t.TPlugin | undefined): tool is t.TPlugin => tool !== undefined);
}

export function mapToolCalls(toolCalls: t.ToolCallResults = []): {
  [key: string]: t.ToolCallResult[] | undefined;
} {
  return toolCalls.reduce(
    (acc, call) => {
      const key = `${call.messageId}_${call.partIndex ?? 0}_${call.blockIndex ?? 0}_${call.toolId}`;
      const array = acc[key] ?? [];
      array.push(call);
      acc[key] = array;

      return acc;
    },
    {} as { [key: string]: t.ToolCallResult[] | undefined },
  );
}
