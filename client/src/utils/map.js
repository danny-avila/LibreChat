/** Maps Attachments by `toolCallId` for quick lookup */
export function mapAttachments(attachments) {
    const attachmentMap = {};
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
        attachmentMap[key].push(attachment);
    }
    return attachmentMap;
}
/** Maps Files by `file_id` for quick lookup */
export function mapFiles(files) {
    const fileMap = {};
    for (const file of files) {
        fileMap[file.file_id] = file;
    }
    return fileMap;
}
/** Maps Assistants by `id` for quick lookup */
export function mapAssistants(assistants) {
    const assistantMap = {};
    for (const assistant of assistants) {
        assistantMap[assistant.id] = assistant;
    }
    return assistantMap;
}
/** Maps Agents by `id` for quick lookup */
export function mapAgents(agents) {
    const agentsMap = {};
    for (const agent of agents) {
        agentsMap[agent.id] = agent;
    }
    return agentsMap;
}
/** Maps Plugins by `pluginKey` for quick lookup */
export function mapPlugins(plugins) {
    return plugins.reduce((acc, plugin) => {
        acc[plugin.pluginKey] = plugin;
        return acc;
    }, {});
}
/** Transform query data to object with list and map fields */
export const selectPlugins = (data) => {
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
export function processPlugins(tools, allPlugins) {
    return tools
        .map((tool) => {
        if (typeof tool === 'string') {
            return allPlugins?.[tool];
        }
        return tool;
    })
        .filter((tool) => tool !== undefined);
}
export function mapToolCalls(toolCalls = []) {
    return toolCalls.reduce((acc, call) => {
        const key = `${call.messageId}_${call.partIndex ?? 0}_${call.blockIndex ?? 0}_${call.toolId}`;
        const array = acc[key] ?? [];
        array.push(call);
        acc[key] = array;
        return acc;
    }, {});
}
