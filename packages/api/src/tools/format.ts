import { AuthType, Constants, EToolResources } from 'librechat-data-provider';
import type { TCustomConfig, TPlugin } from 'librechat-data-provider';
import { LCAvailableTools, LCFunctionTool } from '~/mcp/types';

/**
 * Filters out duplicate plugins from the list of plugins.
 *
 * @param plugins The list of plugins to filter.
 * @returns The list of plugins with duplicates removed.
 */
export const filterUniquePlugins = (plugins?: TPlugin[]): TPlugin[] => {
  const seen = new Set();
  return (
    plugins?.filter((plugin) => {
      const duplicate = seen.has(plugin.pluginKey);
      seen.add(plugin.pluginKey);
      return !duplicate;
    }) || []
  );
};

/**
 * Determines if a plugin is authenticated by checking if all required authentication fields have non-empty values.
 * Supports alternate authentication fields, allowing validation against multiple possible environment variables.
 *
 * @param plugin The plugin object containing the authentication configuration.
 * @returns True if the plugin is authenticated for all required fields, false otherwise.
 */
export const checkPluginAuth = (plugin?: TPlugin): boolean => {
  if (!plugin?.authConfig || plugin.authConfig.length === 0) {
    return false;
  }

  return plugin.authConfig.every((authFieldObj) => {
    const authFieldOptions = authFieldObj.authField.split('||');
    let isFieldAuthenticated = false;

    for (const fieldOption of authFieldOptions) {
      const envValue = process.env[fieldOption];
      if (envValue && envValue.trim() !== '' && envValue !== AuthType.USER_PROVIDED) {
        isFieldAuthenticated = true;
        break;
      }
    }

    return isFieldAuthenticated;
  });
};

/**
 * Converts MCP function format tool to plugin format
 * @param params
 * @param params.toolKey
 * @param params.toolData
 * @param params.customConfig
 * @returns
 */
export function convertMCPToolToPlugin({
  toolKey,
  toolData,
  customConfig,
}: {
  toolKey: string;
  toolData: LCFunctionTool;
  customConfig?: Partial<TCustomConfig> | null;
}): TPlugin | undefined {
  if (!toolData.function || !toolKey.includes(Constants.mcp_delimiter)) {
    return;
  }

  const functionData = toolData.function;
  const parts = toolKey.split(Constants.mcp_delimiter);
  const serverName = parts[parts.length - 1];

  const serverConfig = customConfig?.mcpServers?.[serverName];

  const plugin: TPlugin = {
    /** Tool name without server suffix */
    name: parts[0],
    pluginKey: toolKey,
    description: functionData.description || '',
    authenticated: true,
    icon: serverConfig?.iconPath,
  };

  if (!serverConfig?.customUserVars) {
    /** `authConfig` for MCP tools */
    plugin.authConfig = [];
    return plugin;
  }

  const customVarKeys = Object.keys(serverConfig.customUserVars);
  if (customVarKeys.length === 0) {
    plugin.authConfig = [];
  } else {
    plugin.authConfig = Object.entries(serverConfig.customUserVars).map(([key, value]) => ({
      authField: key,
      label: value.title || key,
      description: value.description || '',
    }));
  }

  return plugin;
}

/**
 * Converts MCP function format tools to plugin format
 * @param functionTools - Object with function format tools
 * @param customConfig - Custom configuration for MCP servers
 * @returns Array of plugin objects
 */
export function convertMCPToolsToPlugins({
  functionTools,
  customConfig,
}: {
  functionTools?: LCAvailableTools;
  customConfig?: Partial<TCustomConfig> | null;
}): TPlugin[] | undefined {
  if (!functionTools || typeof functionTools !== 'object') {
    return;
  }

  const plugins: TPlugin[] = [];
  for (const [toolKey, toolData] of Object.entries(functionTools)) {
    const plugin = convertMCPToolToPlugin({ toolKey, toolData, customConfig });
    if (plugin) {
      plugins.push(plugin);
    }
  }

  return plugins;
}

/**
 * @param toolkits
 * @param toolName
 * @returns toolKey
 */
export function getToolkitKey({
  toolkits,
  toolName,
}: {
  toolkits: TPlugin[];
  toolName?: string;
}): string | undefined {
  let toolkitKey: string | undefined;
  if (!toolName) {
    return toolkitKey;
  }
  for (const toolkit of toolkits) {
    if (toolName.startsWith(EToolResources.image_edit)) {
      const splitMatches = toolkit.pluginKey.split('_');
      const suffix = splitMatches[splitMatches.length - 1];
      if (toolName.endsWith(suffix)) {
        toolkitKey = toolkit.pluginKey;
        break;
      }
    }
    if (toolName.startsWith(toolkit.pluginKey)) {
      toolkitKey = toolkit.pluginKey;
      break;
    }
  }
  return toolkitKey;
}
