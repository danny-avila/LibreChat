import { loadToolDefinitions } from './definitions';
import type {
  LoadToolDefinitionsParams,
  LoadToolDefinitionsDeps,
  ActionToolDefinition,
} from './definitions';

describe('definitions.ts', () => {
  const mockLoadAuthValues = jest.fn().mockResolvedValue({});
  const mockGetOrFetchMCPServerTools = jest.fn().mockResolvedValue(null);
  const mockIsBuiltInTool = jest.fn().mockReturnValue(false);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadToolDefinitions', () => {
    it('should return empty result for empty tools array', async () => {
      const params: LoadToolDefinitionsParams = {
        userId: 'user-123',
        agentId: 'agent-123',
        tools: [],
      };

      const deps: LoadToolDefinitionsDeps = {
        getOrFetchMCPServerTools: mockGetOrFetchMCPServerTools,
        isBuiltInTool: mockIsBuiltInTool,
        loadAuthValues: mockLoadAuthValues,
      };

      const result = await loadToolDefinitions(params, deps);

      expect(result.toolDefinitions).toHaveLength(0);
      expect(result.toolRegistry.size).toBe(0);
      expect(result.hasDeferredTools).toBe(false);
    });

    describe('action tool definitions', () => {
      it('should include parameters in action tool definitions', async () => {
        const mockActionDefs: ActionToolDefinition[] = [
          {
            name: 'getWeather_action_weather_com',
            description: 'Get weather for a location',
            parameters: {
              type: 'object',
              properties: {
                latitude: { type: 'number', description: 'Latitude coordinate' },
                longitude: { type: 'number', description: 'Longitude coordinate' },
              },
              required: ['latitude', 'longitude'],
            },
          },
        ];

        const mockGetActionToolDefinitions = jest.fn().mockResolvedValue(mockActionDefs);

        const params: LoadToolDefinitionsParams = {
          userId: 'user-123',
          agentId: 'agent-123',
          tools: ['getWeather_action_weather---com'],
        };

        const deps: LoadToolDefinitionsDeps = {
          getOrFetchMCPServerTools: mockGetOrFetchMCPServerTools,
          isBuiltInTool: mockIsBuiltInTool,
          loadAuthValues: mockLoadAuthValues,
          getActionToolDefinitions: mockGetActionToolDefinitions,
        };

        const result = await loadToolDefinitions(params, deps);

        expect(mockGetActionToolDefinitions).toHaveBeenCalledWith('agent-123', [
          'getWeather_action_weather---com',
        ]);

        const actionDef = result.toolDefinitions.find(
          (d) => d.name === 'getWeather_action_weather_com',
        );
        expect(actionDef).toBeDefined();
        expect(actionDef?.parameters).toBeDefined();
        expect(actionDef?.parameters?.type).toBe('object');
        expect(actionDef?.parameters?.properties).toHaveProperty('latitude');
        expect(actionDef?.parameters?.properties).toHaveProperty('longitude');
        expect(actionDef?.parameters?.required).toContain('latitude');
        expect(actionDef?.parameters?.required).toContain('longitude');
      });

      it('should handle action definitions without parameters', async () => {
        const mockActionDefs: ActionToolDefinition[] = [
          {
            name: 'listItems_action_api_example_com',
            description: 'List all items',
          },
        ];

        const mockGetActionToolDefinitions = jest.fn().mockResolvedValue(mockActionDefs);

        const params: LoadToolDefinitionsParams = {
          userId: 'user-123',
          agentId: 'agent-123',
          tools: ['listItems_action_api---example---com'],
        };

        const deps: LoadToolDefinitionsDeps = {
          getOrFetchMCPServerTools: mockGetOrFetchMCPServerTools,
          isBuiltInTool: mockIsBuiltInTool,
          loadAuthValues: mockLoadAuthValues,
          getActionToolDefinitions: mockGetActionToolDefinitions,
        };

        const result = await loadToolDefinitions(params, deps);

        const actionDef = result.toolDefinitions.find(
          (d) => d.name === 'listItems_action_api_example_com',
        );
        expect(actionDef).toBeDefined();
        expect(actionDef?.parameters).toBeUndefined();
      });

      it('should not call getActionToolDefinitions when no action tools present', async () => {
        const mockGetActionToolDefinitions = jest.fn();
        mockIsBuiltInTool.mockReturnValue(true);

        const params: LoadToolDefinitionsParams = {
          userId: 'user-123',
          agentId: 'agent-123',
          tools: ['calculator', 'web_search'],
        };

        const deps: LoadToolDefinitionsDeps = {
          getOrFetchMCPServerTools: mockGetOrFetchMCPServerTools,
          isBuiltInTool: mockIsBuiltInTool,
          loadAuthValues: mockLoadAuthValues,
          getActionToolDefinitions: mockGetActionToolDefinitions,
        };

        await loadToolDefinitions(params, deps);

        expect(mockGetActionToolDefinitions).not.toHaveBeenCalled();
      });
    });

    describe('built-in tool definitions', () => {
      it('should include parameters for known built-in tools', async () => {
        mockIsBuiltInTool.mockImplementation((name) => name === 'calculator');

        const params: LoadToolDefinitionsParams = {
          userId: 'user-123',
          agentId: 'agent-123',
          tools: ['calculator'],
        };

        const deps: LoadToolDefinitionsDeps = {
          getOrFetchMCPServerTools: mockGetOrFetchMCPServerTools,
          isBuiltInTool: mockIsBuiltInTool,
          loadAuthValues: mockLoadAuthValues,
        };

        const result = await loadToolDefinitions(params, deps);

        const calcDef = result.toolDefinitions.find((d) => d.name === 'calculator');
        expect(calcDef).toBeDefined();
        expect(calcDef?.parameters).toBeDefined();
      });

      it('should include parameters for execute_code native tool', async () => {
        mockIsBuiltInTool.mockImplementation((name) => name === 'execute_code');

        const params: LoadToolDefinitionsParams = {
          userId: 'user-123',
          agentId: 'agent-123',
          tools: ['execute_code'],
        };

        const deps: LoadToolDefinitionsDeps = {
          getOrFetchMCPServerTools: mockGetOrFetchMCPServerTools,
          isBuiltInTool: mockIsBuiltInTool,
          loadAuthValues: mockLoadAuthValues,
        };

        const result = await loadToolDefinitions(params, deps);

        const execCodeDef = result.toolDefinitions.find((d) => d.name === 'execute_code');
        expect(execCodeDef).toBeDefined();
        expect(execCodeDef?.parameters).toBeDefined();
        expect(execCodeDef?.parameters?.properties).toHaveProperty('lang');
        expect(execCodeDef?.parameters?.properties).toHaveProperty('code');
        expect(execCodeDef?.parameters?.required).toContain('lang');
        expect(execCodeDef?.parameters?.required).toContain('code');
      });

      it('should include parameters for web_search native tool', async () => {
        mockIsBuiltInTool.mockImplementation((name) => name === 'web_search');

        const params: LoadToolDefinitionsParams = {
          userId: 'user-123',
          agentId: 'agent-123',
          tools: ['web_search'],
        };

        const deps: LoadToolDefinitionsDeps = {
          getOrFetchMCPServerTools: mockGetOrFetchMCPServerTools,
          isBuiltInTool: mockIsBuiltInTool,
          loadAuthValues: mockLoadAuthValues,
        };

        const result = await loadToolDefinitions(params, deps);

        const webSearchDef = result.toolDefinitions.find((d) => d.name === 'web_search');
        expect(webSearchDef).toBeDefined();
        expect(webSearchDef?.parameters).toBeDefined();
        expect(webSearchDef?.parameters?.properties).toHaveProperty('query');
        expect(webSearchDef?.parameters?.required).toContain('query');
      });

      it('should include parameters for file_search native tool', async () => {
        mockIsBuiltInTool.mockImplementation((name) => name === 'file_search');

        const params: LoadToolDefinitionsParams = {
          userId: 'user-123',
          agentId: 'agent-123',
          tools: ['file_search'],
        };

        const deps: LoadToolDefinitionsDeps = {
          getOrFetchMCPServerTools: mockGetOrFetchMCPServerTools,
          isBuiltInTool: mockIsBuiltInTool,
          loadAuthValues: mockLoadAuthValues,
        };

        const result = await loadToolDefinitions(params, deps);

        const fileSearchDef = result.toolDefinitions.find((d) => d.name === 'file_search');
        expect(fileSearchDef).toBeDefined();
        expect(fileSearchDef?.parameters).toBeDefined();
        expect(fileSearchDef?.parameters?.properties).toHaveProperty('query');
        expect(fileSearchDef?.parameters?.required).toContain('query');
      });
    });
  });
});
