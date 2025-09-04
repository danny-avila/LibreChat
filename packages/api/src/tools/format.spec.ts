import { AuthType, Constants, EToolResources } from 'librechat-data-provider';
import type { TPlugin, FunctionTool, TCustomConfig } from 'librechat-data-provider';
import {
  convertMCPToolsToPlugins,
  filterUniquePlugins,
  checkPluginAuth,
  getToolkitKey,
} from './format';

describe('format.ts helper functions', () => {
  describe('filterUniquePlugins', () => {
    it('should return empty array when plugins is undefined', () => {
      const result = filterUniquePlugins(undefined);
      expect(result).toEqual([]);
    });

    it('should return empty array when plugins is empty', () => {
      const result = filterUniquePlugins([]);
      expect(result).toEqual([]);
    });

    it('should filter out duplicate plugins based on pluginKey', () => {
      const plugins: TPlugin[] = [
        { name: 'Plugin1', pluginKey: 'key1', description: 'First plugin' },
        { name: 'Plugin2', pluginKey: 'key2', description: 'Second plugin' },
        { name: 'Plugin1 Duplicate', pluginKey: 'key1', description: 'Duplicate of first' },
        { name: 'Plugin3', pluginKey: 'key3', description: 'Third plugin' },
      ];

      const result = filterUniquePlugins(plugins);
      expect(result).toHaveLength(3);
      expect(result[0].pluginKey).toBe('key1');
      expect(result[1].pluginKey).toBe('key2');
      expect(result[2].pluginKey).toBe('key3');
      // The first occurrence should be kept
      expect(result[0].name).toBe('Plugin1');
    });

    it('should handle plugins with identical data', () => {
      const plugin: TPlugin = { name: 'Plugin', pluginKey: 'key', description: 'Test' };
      const plugins: TPlugin[] = [plugin, plugin, plugin];

      const result = filterUniquePlugins(plugins);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(plugin);
    });
  });

  describe('checkPluginAuth', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return false when plugin is undefined', () => {
      const result = checkPluginAuth(undefined);
      expect(result).toBe(false);
    });

    it('should return false when authConfig is undefined', () => {
      const plugin: TPlugin = { name: 'Test', pluginKey: 'test', description: 'Test plugin' };
      const result = checkPluginAuth(plugin);
      expect(result).toBe(false);
    });

    it('should return false when authConfig is empty array', () => {
      const plugin: TPlugin = {
        name: 'Test',
        pluginKey: 'test',
        description: 'Test plugin',
        authConfig: [],
      };
      const result = checkPluginAuth(plugin);
      expect(result).toBe(false);
    });

    it('should return true when all required auth fields have valid env values', () => {
      process.env.API_KEY = 'valid-key';
      process.env.SECRET_KEY = 'valid-secret';

      const plugin: TPlugin = {
        name: 'Test',
        pluginKey: 'test',
        description: 'Test plugin',
        authConfig: [
          { authField: 'API_KEY', label: 'API Key', description: 'API Key' },
          { authField: 'SECRET_KEY', label: 'Secret Key', description: 'Secret Key' },
        ],
      };

      const result = checkPluginAuth(plugin);
      expect(result).toBe(true);
    });

    it('should return false when any required auth field is missing', () => {
      process.env.API_KEY = 'valid-key';
      // SECRET_KEY is not set

      const plugin: TPlugin = {
        name: 'Test',
        pluginKey: 'test',
        description: 'Test plugin',
        authConfig: [
          { authField: 'API_KEY', label: 'API Key', description: 'API Key' },
          { authField: 'SECRET_KEY', label: 'Secret Key', description: 'Secret Key' },
        ],
      };

      const result = checkPluginAuth(plugin);
      expect(result).toBe(false);
    });

    it('should return false when auth field value is empty string', () => {
      process.env.API_KEY = '';

      const plugin: TPlugin = {
        name: 'Test',
        pluginKey: 'test',
        description: 'Test plugin',
        authConfig: [{ authField: 'API_KEY', label: 'API Key', description: 'API Key' }],
      };

      const result = checkPluginAuth(plugin);
      expect(result).toBe(false);
    });

    it('should return false when auth field value is whitespace only', () => {
      process.env.API_KEY = '   ';

      const plugin: TPlugin = {
        name: 'Test',
        pluginKey: 'test',
        description: 'Test plugin',
        authConfig: [{ authField: 'API_KEY', label: 'API Key', description: 'API Key' }],
      };

      const result = checkPluginAuth(plugin);
      expect(result).toBe(false);
    });

    it('should return false when auth field value is USER_PROVIDED', () => {
      process.env.API_KEY = AuthType.USER_PROVIDED;

      const plugin: TPlugin = {
        name: 'Test',
        pluginKey: 'test',
        description: 'Test plugin',
        authConfig: [{ authField: 'API_KEY', label: 'API Key', description: 'API Key' }],
      };

      const result = checkPluginAuth(plugin);
      expect(result).toBe(false);
    });

    it('should handle alternate auth fields with || separator', () => {
      process.env.ALTERNATE_KEY = 'valid-key';

      const plugin: TPlugin = {
        name: 'Test',
        pluginKey: 'test',
        description: 'Test plugin',
        authConfig: [
          { authField: 'PRIMARY_KEY||ALTERNATE_KEY', label: 'API Key', description: 'API Key' },
        ],
      };

      const result = checkPluginAuth(plugin);
      expect(result).toBe(true);
    });

    it('should return true when at least one alternate auth field is valid', () => {
      process.env.PRIMARY_KEY = '';
      process.env.ALTERNATE_KEY = 'valid-key';
      process.env.THIRD_KEY = AuthType.USER_PROVIDED;

      const plugin: TPlugin = {
        name: 'Test',
        pluginKey: 'test',
        description: 'Test plugin',
        authConfig: [
          {
            authField: 'PRIMARY_KEY||ALTERNATE_KEY||THIRD_KEY',
            label: 'API Key',
            description: 'API Key',
          },
        ],
      };

      const result = checkPluginAuth(plugin);
      expect(result).toBe(true);
    });
  });

  describe('convertMCPToolsToPlugins', () => {
    it('should return undefined when functionTools is undefined', () => {
      const result = convertMCPToolsToPlugins({ functionTools: undefined });
      expect(result).toBeUndefined();
    });

    it('should return undefined when functionTools is not an object', () => {
      const result = convertMCPToolsToPlugins({
        functionTools: 'not-an-object' as unknown as Record<string, FunctionTool>,
      });
      expect(result).toBeUndefined();
    });

    it('should return empty array when functionTools is empty object', () => {
      const result = convertMCPToolsToPlugins({ functionTools: {} });
      expect(result).toEqual([]);
    });

    it('should skip entries without function property', () => {
      const functionTools: Record<string, FunctionTool> = {
        tool1: { type: 'function' } as FunctionTool,
        tool2: { function: { name: 'tool2', description: 'Tool 2' } } as FunctionTool,
      };

      const result = convertMCPToolsToPlugins({ functionTools });
      expect(result).toHaveLength(0); // tool2 doesn't have mcp_delimiter in key
    });

    it('should skip entries without mcp_delimiter in key', () => {
      const functionTools: Record<string, FunctionTool> = {
        'regular-tool': {
          type: 'function',
          function: { name: 'regular-tool', description: 'Regular tool' },
        } as FunctionTool,
      };

      const result = convertMCPToolsToPlugins({ functionTools });
      expect(result).toHaveLength(0);
    });

    it('should convert MCP tools to plugins correctly', () => {
      const functionTools: Record<string, FunctionTool> = {
        [`tool1${Constants.mcp_delimiter}server1`]: {
          type: 'function',
          function: { name: 'tool1', description: 'Tool 1 description' },
        } as FunctionTool,
      };

      const result = convertMCPToolsToPlugins({ functionTools });
      expect(result).toHaveLength(1);
      expect(result![0]).toEqual({
        name: 'tool1',
        pluginKey: `tool1${Constants.mcp_delimiter}server1`,
        description: 'Tool 1 description',
        authenticated: true,
        icon: undefined,
        authConfig: [],
      });
    });

    it('should handle missing description', () => {
      const functionTools: Record<string, FunctionTool> = {
        [`tool1${Constants.mcp_delimiter}server1`]: {
          type: 'function',
          function: { name: 'tool1' },
        } as FunctionTool,
      };

      const result = convertMCPToolsToPlugins({ functionTools });
      expect(result).toHaveLength(1);
      expect(result![0].description).toBe('');
    });

    it('should add icon from server config', () => {
      const functionTools: Record<string, FunctionTool> = {
        [`tool1${Constants.mcp_delimiter}server1`]: {
          type: 'function',
          function: { name: 'tool1', description: 'Tool 1' },
        } as FunctionTool,
      };

      const customConfig: Partial<TCustomConfig> = {
        mcpServers: {
          server1: {
            command: 'test',
            args: [],
            iconPath: '/path/to/icon.png',
          },
        },
      };

      const result = convertMCPToolsToPlugins({ functionTools, customConfig });
      expect(result).toHaveLength(1);
      expect(result![0].icon).toBe('/path/to/icon.png');
    });

    it('should handle customUserVars in server config', () => {
      const functionTools: Record<string, FunctionTool> = {
        [`tool1${Constants.mcp_delimiter}server1`]: {
          type: 'function',
          function: { name: 'tool1', description: 'Tool 1' },
        } as FunctionTool,
      };

      const customConfig: Partial<TCustomConfig> = {
        mcpServers: {
          server1: {
            command: 'test',
            args: [],
            customUserVars: {
              API_KEY: { title: 'API Key', description: 'Your API key' },
              SECRET: { title: 'Secret', description: 'Your secret' },
            },
          },
        },
      };

      const result = convertMCPToolsToPlugins({ functionTools, customConfig });
      expect(result).toHaveLength(1);
      expect(result![0].authConfig).toHaveLength(2);
      expect(result![0].authConfig).toEqual([
        { authField: 'API_KEY', label: 'API Key', description: 'Your API key' },
        { authField: 'SECRET', label: 'Secret', description: 'Your secret' },
      ]);
    });

    it('should use key as label when title is missing in customUserVars', () => {
      const functionTools: Record<string, FunctionTool> = {
        [`tool1${Constants.mcp_delimiter}server1`]: {
          type: 'function',
          function: { name: 'tool1', description: 'Tool 1' },
        } as FunctionTool,
      };

      const customConfig: Partial<TCustomConfig> = {
        mcpServers: {
          server1: {
            command: 'test',
            args: [],
            customUserVars: {
              API_KEY: { title: 'API Key', description: 'Your API key' },
            },
          },
        },
      };

      const result = convertMCPToolsToPlugins({ functionTools, customConfig });
      expect(result).toHaveLength(1);
      expect(result![0].authConfig).toEqual([
        { authField: 'API_KEY', label: 'API Key', description: 'Your API key' },
      ]);
    });

    it('should handle empty customUserVars', () => {
      const functionTools: Record<string, FunctionTool> = {
        [`tool1${Constants.mcp_delimiter}server1`]: {
          type: 'function',
          function: { name: 'tool1', description: 'Tool 1' },
        } as FunctionTool,
      };

      const customConfig: Partial<TCustomConfig> = {
        mcpServers: {
          server1: {
            command: 'test',
            args: [],
            customUserVars: {},
          },
        },
      };

      const result = convertMCPToolsToPlugins({ functionTools, customConfig });
      expect(result).toHaveLength(1);
      expect(result![0].authConfig).toEqual([]);
    });
  });

  describe('getToolkitKey', () => {
    it('should return undefined when toolName is undefined', () => {
      const toolkits: TPlugin[] = [
        { name: 'Toolkit1', pluginKey: 'toolkit1', description: 'Test toolkit' },
      ];

      const result = getToolkitKey({ toolkits, toolName: undefined });
      expect(result).toBeUndefined();
    });

    it('should return undefined when toolName is empty string', () => {
      const toolkits: TPlugin[] = [
        { name: 'Toolkit1', pluginKey: 'toolkit1', description: 'Test toolkit' },
      ];

      const result = getToolkitKey({ toolkits, toolName: '' });
      expect(result).toBeUndefined();
    });

    it('should return undefined when no matching toolkit is found', () => {
      const toolkits: TPlugin[] = [
        { name: 'Toolkit1', pluginKey: 'toolkit1', description: 'Test toolkit' },
        { name: 'Toolkit2', pluginKey: 'toolkit2', description: 'Test toolkit' },
      ];

      const result = getToolkitKey({ toolkits, toolName: 'nonexistent_tool' });
      expect(result).toBeUndefined();
    });

    it('should match toolkit when toolName starts with pluginKey', () => {
      const toolkits: TPlugin[] = [
        { name: 'Toolkit1', pluginKey: 'toolkit1', description: 'Test toolkit' },
        { name: 'Toolkit2', pluginKey: 'toolkit2', description: 'Test toolkit' },
      ];

      const result = getToolkitKey({ toolkits, toolName: 'toolkit2_function' });
      expect(result).toBe('toolkit2');
    });

    it('should handle image_edit tools with suffix matching', () => {
      const toolkits: TPlugin[] = [
        { name: 'Image Editor', pluginKey: 'image_edit_v1', description: 'Image editing' },
        { name: 'Image Editor 2', pluginKey: 'image_edit_v2', description: 'Image editing v2' },
      ];

      const result = getToolkitKey({
        toolkits,
        toolName: `${EToolResources.image_edit}_function_v2`,
      });
      expect(result).toBe('image_edit_v2');
    });

    it('should match the first toolkit when multiple matches are possible', () => {
      const toolkits: TPlugin[] = [
        { name: 'Toolkit', pluginKey: 'toolkit', description: 'Base toolkit' },
        { name: 'Toolkit Extended', pluginKey: 'toolkit_extended', description: 'Extended' },
      ];

      const result = getToolkitKey({ toolkits, toolName: 'toolkit_function' });
      expect(result).toBe('toolkit');
    });

    it('should handle empty toolkits array', () => {
      const toolkits: TPlugin[] = [];

      const result = getToolkitKey({ toolkits, toolName: 'any_tool' });
      expect(result).toBeUndefined();
    });

    it('should handle complex plugin keys with underscores', () => {
      const toolkits: TPlugin[] = [
        {
          name: 'Complex Toolkit',
          pluginKey: 'complex_toolkit_with_underscores',
          description: 'Complex',
        },
      ];

      const result = getToolkitKey({
        toolkits,
        toolName: 'complex_toolkit_with_underscores_function',
      });
      expect(result).toBe('complex_toolkit_with_underscores');
    });
  });
});
