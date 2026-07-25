import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Constants, FileSources } from 'librechat-data-provider';
import { agentSchema, createMethods } from '@librechat/data-schemas';
import type {
  Agent as LibreChatAgent,
  AgentModelParameters,
  TEphemeralAgent,
  TConversation,
} from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type { LoadAgentParams, LoadAgentDeps } from '../load';
import { loadAddedAgent } from '../added';
import { loadAgent } from '../load';

let Agent: mongoose.Model<unknown>;
let createAgent: ReturnType<typeof createMethods>['createAgent'];
let getAgent: ReturnType<typeof createMethods>['getAgent'];

const mockGetMCPServerTools = jest.fn();

const deps: LoadAgentDeps = {
  getAgent: (searchParameter) => getAgent(searchParameter) as Promise<LibreChatAgent | null>,
  getMCPServerTools: mockGetMCPServerTools,
};

describe('loadAgent', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    Agent = mongoose.models.Agent || mongoose.model('Agent', agentSchema);
    await mongoose.connect(mongoUri);
    const methods = createMethods(mongoose);
    createAgent = methods.createAgent;
    getAgent = methods.getAgent;
  }, 20000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Agent.deleteMany({});
    jest.clearAllMocks();
  });

  test('should return null when agent_id is not provided', async () => {
    const mockReq = { user: { id: 'user123' } };
    const result = await loadAgent(
      {
        req: mockReq,
        agent_id: null as unknown as string,
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4' } as unknown as AgentModelParameters,
      },
      deps,
    );

    expect(result).toBeNull();
  });

  test('should return null when agent_id is empty string', async () => {
    const mockReq = { user: { id: 'user123' } };
    const result = await loadAgent(
      {
        req: mockReq,
        agent_id: '',
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4' } as unknown as AgentModelParameters,
      },
      deps,
    );

    expect(result).toBeNull();
  });

  test('should test ephemeral agent loading logic', async () => {
    const { EPHEMERAL_AGENT_ID } = Constants;

    // Mock getMCPServerTools to return tools for each server
    mockGetMCPServerTools.mockImplementation(async (_userId: string, server: string) => {
      if (server === 'server1') {
        return { tool1_mcp_server1: {} };
      } else if (server === 'server2') {
        return { tool2_mcp_server2: {} };
      }
      return null;
    });

    const mockReq = {
      user: { id: 'user123' },
      body: {
        promptPrefix: 'Test instructions',
        ephemeralAgent: {
          execute_code: true,
          web_search: true,
          mcp: ['server1', 'server2'],
        },
      },
    };

    const result = await loadAgent(
      {
        req: mockReq,
        agent_id: EPHEMERAL_AGENT_ID as string,
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4', temperature: 0.7 } as unknown as AgentModelParameters,
      },
      deps,
    );

    if (result) {
      // Ephemeral agent ID is encoded with endpoint and model
      expect(result.id).toBe('openai__gpt-4');
      expect(result.instructions).toBe('Test instructions');
      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-4');
      expect(result.model_parameters.temperature).toBe(0.7);
      expect(result.tools).toContain('execute_code');
      expect(result.tools).toContain('web_search');
      expect(result.tools).toContain('tool1_mcp_server1');
      expect(result.tools).toContain('tool2_mcp_server2');
    } else {
      expect(result).toBeNull();
    }
  });

  test('should skip cached tools for servers made request-scoped by a config overlay', async () => {
    const { EPHEMERAL_AGENT_ID } = Constants;

    mockGetMCPServerTools.mockResolvedValue({ tool1_mcp_server1: {} });

    const mockReq = {
      user: { id: 'user123' },
      config: {
        mcpConfig: {
          'body-scoped': {
            type: 'streamable-http' as const,
            url: 'https://mcp.example.com/{{LIBRECHAT_BODY_CONVERSATIONID}}/mcp',
          },
        },
      } as unknown as AppConfig,
      body: {
        ephemeralAgent: {
          mcp: ['body-scoped', 'server1'],
        },
      },
    };

    const result = await loadAgent(
      {
        req: mockReq,
        agent_id: EPHEMERAL_AGENT_ID as string,
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4' } as unknown as AgentModelParameters,
      },
      deps,
    );

    expect(mockGetMCPServerTools).toHaveBeenCalledTimes(1);
    expect(mockGetMCPServerTools).toHaveBeenCalledWith('user123', 'server1');
    expect(result?.tools).toContain(`${Constants.mcp_all}${Constants.mcp_delimiter}body-scoped`);
    expect(result?.tools).toContain('tool1_mcp_server1');
  });

  test('should return null for non-existent agent', async () => {
    const mockReq = { user: { id: 'user123' } };
    const result = await loadAgent(
      {
        req: mockReq,
        agent_id: 'agent_non_existent',
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4' } as unknown as AgentModelParameters,
      },
      deps,
    );

    expect(result).toBeNull();
  });

  test('should load agent when user is the author', async () => {
    const userId = new mongoose.Types.ObjectId();
    const agentId = `agent_${uuidv4()}`;

    await createAgent({
      id: agentId,
      name: 'Test Agent',
      provider: 'openai',
      model: 'gpt-4',
      author: userId,
      description: 'Test description',
      tools: ['web_search'],
    });

    const mockReq = { user: { id: userId.toString() } };
    const result = await loadAgent(
      {
        req: mockReq,
        agent_id: agentId,
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4' } as unknown as AgentModelParameters,
      },
      deps,
    );

    expect(result).toBeDefined();
    expect(result!.id).toBe(agentId);
    expect(result!.name).toBe('Test Agent');
    expect(String(result!.author)).toBe(userId.toString());
    expect(result!.version).toBe(1);
  });

  test('should return agent even when user is not author (permissions checked at route level)', async () => {
    const authorId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const agentId = `agent_${uuidv4()}`;

    await createAgent({
      id: agentId,
      name: 'Test Agent',
      provider: 'openai',
      model: 'gpt-4',
      author: authorId,
    });

    const mockReq = { user: { id: userId.toString() } };
    const result = await loadAgent(
      {
        req: mockReq,
        agent_id: agentId,
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4' } as unknown as AgentModelParameters,
      },
      deps,
    );

    // With the new permission system, loadAgent returns the agent regardless of permissions
    // Permission checks are handled at the route level via middleware
    expect(result).toBeTruthy();
    expect(result!.id).toBe(agentId);
    expect(result!.name).toBe('Test Agent');
  });

  test('should handle ephemeral agent with no MCP servers', async () => {
    const { EPHEMERAL_AGENT_ID } = Constants;

    const mockReq = {
      user: { id: 'user123' },
      body: {
        promptPrefix: 'Simple instructions',
        ephemeralAgent: {
          execute_code: false,
          web_search: false,
          mcp: [],
        },
      },
    };

    const result = await loadAgent(
      {
        req: mockReq,
        agent_id: EPHEMERAL_AGENT_ID as string,
        endpoint: 'openai',
        model_parameters: { model: 'gpt-3.5-turbo' } as unknown as AgentModelParameters,
      },
      deps,
    );

    if (result) {
      expect(result.tools).toEqual([]);
      expect(result.instructions).toBe('Simple instructions');
    } else {
      expect(result).toBeFalsy();
    }
  });

  test('should use parsed promptPrefix for ephemeral agent instructions', async () => {
    const { EPHEMERAL_AGENT_ID } = Constants;

    const result = await loadAgent(
      {
        req: { user: { id: 'user123' }, body: {} },
        agent_id: EPHEMERAL_AGENT_ID as string,
        endpoint: 'openai',
        model_parameters: {
          model: 'gpt-4',
          promptPrefix: 'Server-side model spec instructions',
        } as unknown as AgentModelParameters,
      },
      deps,
    );

    expect(result?.instructions).toBe('Server-side model spec instructions');
    expect(result?.model_parameters).not.toHaveProperty('promptPrefix');
  });

  test('should equip ask_user_question from the ephemeralAgent request flag', async () => {
    const { EPHEMERAL_AGENT_ID } = Constants;

    const result = await loadAgent(
      {
        req: {
          user: { id: 'user123' },
          body: {
            ephemeralAgent: { ask_user_question: true } as TEphemeralAgent,
          },
        },
        agent_id: EPHEMERAL_AGENT_ID as string,
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4' } as unknown as AgentModelParameters,
      },
      deps,
    );

    expect(result?.tools).toContain('ask_user_question');
  });

  test('should equip ask_user_question from a model spec (askUserQuestion: true)', async () => {
    const { EPHEMERAL_AGENT_ID } = Constants;

    const result = await loadAgent(
      {
        req: {
          user: { id: 'user123' },
          body: {},
          config: {
            config: {},
            fileStrategy: FileSources.local,
            imageOutputType: 'png',
            modelSpecs: {
              list: [
                {
                  name: 'asks-questions',
                  label: 'Asks Questions',
                  preset: { endpoint: 'openai', model: 'gpt-4' },
                  askUserQuestion: true,
                },
                {
                  name: 'no-questions',
                  label: 'No Questions',
                  preset: { endpoint: 'openai', model: 'gpt-4' },
                },
              ],
            },
          },
        },
        spec: 'asks-questions',
        agent_id: EPHEMERAL_AGENT_ID as string,
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4' } as unknown as AgentModelParameters,
      },
      deps,
    );

    expect(result?.tools).toContain('ask_user_question');

    const withoutFlag = await loadAgent(
      {
        req: {
          user: { id: 'user123' },
          body: {},
          config: {
            config: {},
            fileStrategy: FileSources.local,
            imageOutputType: 'png',
            modelSpecs: {
              list: [
                {
                  name: 'no-questions',
                  label: 'No Questions',
                  preset: { endpoint: 'openai', model: 'gpt-4' },
                },
              ],
            },
          },
        },
        spec: 'no-questions',
        agent_id: EPHEMERAL_AGENT_ID as string,
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4' } as unknown as AgentModelParameters,
      },
      deps,
    );

    expect(withoutFlag?.tools).not.toContain('ask_user_question');
  });

  test('synthesizes background tool_options for eligible MCP tools from the ephemeralAgent flag', async () => {
    const { EPHEMERAL_AGENT_ID } = Constants;
    mockGetMCPServerTools.mockResolvedValue({ crm_lookup: { name: 'crm_lookup' } });

    const result = await loadAgent(
      {
        req: {
          user: { id: 'user123' },
          body: {
            ephemeralAgent: {
              mcp: ['crm'],
              web_search: true,
              execute_code: true,
              run_in_background: true,
            } as TEphemeralAgent,
          },
        },
        agent_id: EPHEMERAL_AGENT_ID as string,
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4' } as unknown as AgentModelParameters,
      },
      deps,
    );

    // eligible tools opt in (MCP + code execution); excluded built-ins (web_search) do not
    expect(result?.tool_options?.crm_lookup).toEqual({ run_in_background: true });
    expect(result?.tool_options?.web_search).toBeUndefined();
    expect(result?.tool_options?.execute_code).toEqual({ run_in_background: true });
  });

  test('synthesizes background tool_options from a model spec (runInBackground: true), and not without it', async () => {
    const { EPHEMERAL_AGENT_ID } = Constants;
    mockGetMCPServerTools.mockResolvedValue({ crm_lookup: { name: 'crm_lookup' } });

    const buildReq = (specName: string, runInBackground: boolean): LoadAgentParams['req'] =>
      ({
        user: { id: 'user123' },
        body: {},
        config: {
          config: {},
          fileStrategy: FileSources.local,
          imageOutputType: 'png',
          modelSpecs: {
            list: [
              {
                name: specName,
                label: specName,
                preset: { endpoint: 'openai', model: 'gpt-4' },
                webSearch: true,
                mcpServers: ['crm'],
                runInBackground,
              },
            ],
          },
        },
      }) as unknown as LoadAgentParams['req'];

    const withFlag = await loadAgent(
      {
        req: buildReq('bg-on', true),
        spec: 'bg-on',
        agent_id: EPHEMERAL_AGENT_ID as string,
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4' } as unknown as AgentModelParameters,
      },
      deps,
    );
    expect(withFlag?.tool_options?.crm_lookup).toEqual({ run_in_background: true });
    expect(withFlag?.tool_options?.web_search).toBeUndefined();

    const withoutFlag = await loadAgent(
      {
        req: buildReq('bg-off', false),
        spec: 'bg-off',
        agent_id: EPHEMERAL_AGENT_ID as string,
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4' } as unknown as AgentModelParameters,
      },
      deps,
    );
    expect(withoutFlag?.tool_options).toBeUndefined();
  });

  test('should enable full skill scope for ephemeral model spec with skills true', async () => {
    const { EPHEMERAL_AGENT_ID } = Constants;

    const result = await loadAgent(
      {
        req: {
          user: { id: 'user123' },
          body: {
            ephemeralAgent: {
              subagents: { enabled: false, agent_ids: ['agent_tampered'] },
            } as unknown as TEphemeralAgent,
          },
          config: {
            config: {},
            fileStrategy: FileSources.local,
            imageOutputType: 'png',
            modelSpecs: {
              list: [
                {
                  name: 'skills-on',
                  label: 'Skills On',
                  preset: { endpoint: 'openai', model: 'gpt-4' },
                  skills: true,
                },
              ],
            },
          },
        },
        spec: 'skills-on',
        agent_id: EPHEMERAL_AGENT_ID as string,
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4' } as unknown as AgentModelParameters,
      },
      deps,
    );

    expect(result?.skills_enabled).toBe(true);
    expect(result?.skills).toBeUndefined();
    expect(result?.subagents).toBeUndefined();
  });

  test('should initialize an empty allowlist for ephemeral model spec skill names', async () => {
    const { EPHEMERAL_AGENT_ID } = Constants;

    const result = await loadAgent(
      {
        req: {
          user: { id: 'user123' },
          body: {},
          config: {
            config: {},
            fileStrategy: FileSources.local,
            imageOutputType: 'png',
            modelSpecs: {
              list: [
                {
                  name: 'scoped-skills',
                  label: 'Scoped Skills',
                  preset: { endpoint: 'openai', model: 'gpt-4' },
                  skills: ['finance-analyst', 'brand-writer'],
                },
              ],
            },
          },
        },
        spec: 'scoped-skills',
        agent_id: EPHEMERAL_AGENT_ID as string,
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4' } as unknown as AgentModelParameters,
      },
      deps,
    );

    expect(result?.skills_enabled).toBe(true);
    expect(result?.skills).toEqual([]);
  });

  test('should apply subagent config for ephemeral model specs', async () => {
    const { EPHEMERAL_AGENT_ID } = Constants;
    const subagents = { enabled: true, allowSelf: true, agent_ids: [] };

    const result = await loadAgent(
      {
        req: {
          user: { id: 'user123' },
          body: {},
          config: {
            config: {},
            fileStrategy: FileSources.local,
            imageOutputType: 'png',
            modelSpecs: {
              list: [
                {
                  name: 'self-spawn',
                  label: 'Self Spawn',
                  preset: { endpoint: 'openai', model: 'gpt-4' },
                  subagents,
                },
              ],
            },
          },
        },
        spec: 'self-spawn',
        agent_id: EPHEMERAL_AGENT_ID as string,
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4' } as unknown as AgentModelParameters,
      },
      deps,
    );

    expect(result?.subagents).toEqual(subagents);
  });

  test('should ignore request subagents for ephemeral agents', async () => {
    const { EPHEMERAL_AGENT_ID } = Constants;

    const result = await loadAgent(
      {
        req: {
          user: { id: 'user123' },
          body: {
            ephemeralAgent: {
              subagents: { enabled: true, allowSelf: true, agent_ids: ['agent_other'] },
            } as unknown as TEphemeralAgent,
          },
        },
        agent_id: EPHEMERAL_AGENT_ID as string,
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4' } as unknown as AgentModelParameters,
      },
      deps,
    );

    expect(result?.subagents).toBeUndefined();
  });

  test('should ignore request subagents when added agent mirrors ephemeral primary tools', async () => {
    const { EPHEMERAL_AGENT_ID } = Constants;

    const result = await loadAddedAgent(
      {
        req: {
          user: { id: 'user123' },
          config: {
            config: {},
            fileStrategy: FileSources.local,
            imageOutputType: 'png',
          },
        },
        conversation: {
          endpoint: 'openai',
          model: 'gpt-4',
          ephemeralAgent: { subagents: { enabled: true, allowSelf: true, agent_ids: [] } },
        } as unknown as TConversation,
        primaryAgent: { id: EPHEMERAL_AGENT_ID as string, tools: ['web_search'] } as LibreChatAgent,
      },
      deps,
    );

    expect(result?.tools).toEqual(['web_search']);
    expect(result?.subagents).toBeUndefined();
  });

  test('should ignore request subagents for added ephemeral agents', async () => {
    const result = await loadAddedAgent(
      {
        req: {
          user: { id: 'user123' },
          config: {
            config: {},
            fileStrategy: FileSources.local,
            imageOutputType: 'png',
          },
        },
        conversation: {
          endpoint: 'openai',
          model: 'gpt-4',
          ephemeralAgent: { subagents: { enabled: true, allowSelf: true, agent_ids: [] } },
        } as unknown as TConversation,
      },
      deps,
    );

    expect(result?.subagents).toBeUndefined();
  });

  test('should enable full skill scope for added ephemeral model spec with skills true', async () => {
    const result = await loadAddedAgent(
      {
        req: {
          user: { id: 'user123' },
          config: {
            config: {},
            fileStrategy: FileSources.local,
            imageOutputType: 'png',
            modelSpecs: {
              list: [
                {
                  name: 'added-skills-on',
                  label: 'Added Skills On',
                  preset: { endpoint: 'openai', model: 'gpt-4' },
                  skills: true,
                },
              ],
            },
          },
        },
        conversation: {
          endpoint: 'openai',
          model: 'gpt-4',
          spec: 'added-skills-on',
        } as unknown as TConversation,
      },
      deps,
    );

    expect(result?.skills_enabled).toBe(true);
    expect(result?.skills).toBeUndefined();
  });

  test('should initialize an empty allowlist for added ephemeral model spec skill names', async () => {
    const result = await loadAddedAgent(
      {
        req: {
          user: { id: 'user123' },
          config: {
            config: {},
            fileStrategy: FileSources.local,
            imageOutputType: 'png',
            modelSpecs: {
              list: [
                {
                  name: 'added-scoped-skills',
                  label: 'Added Scoped Skills',
                  preset: { endpoint: 'openai', model: 'gpt-4' },
                  skills: ['finance-analyst', 'brand-writer'],
                },
              ],
            },
          },
        },
        conversation: {
          endpoint: 'openai',
          model: 'gpt-4',
          spec: 'added-scoped-skills',
        } as unknown as TConversation,
      },
      deps,
    );

    expect(result?.skills_enabled).toBe(true);
    expect(result?.skills).toEqual([]);
  });

  test('should apply subagent config for added ephemeral model specs', async () => {
    const subagents = { enabled: true, allowSelf: true, agent_ids: [] };

    const result = await loadAddedAgent(
      {
        req: {
          user: { id: 'user123' },
          config: {
            config: {},
            fileStrategy: FileSources.local,
            imageOutputType: 'png',
            modelSpecs: {
              list: [
                {
                  name: 'added-self-spawn',
                  label: 'Added Self Spawn',
                  preset: { endpoint: 'openai', model: 'gpt-4' },
                  subagents,
                },
              ],
            },
          },
        },
        conversation: {
          endpoint: 'openai',
          model: 'gpt-4',
          spec: 'added-self-spawn',
        } as unknown as TConversation,
      },
      deps,
    );

    expect(result?.subagents).toEqual(subagents);
  });

  test('should apply model spec skills when added agent mirrors ephemeral primary tools', async () => {
    const { EPHEMERAL_AGENT_ID } = Constants;
    const subagents = { enabled: true, allowSelf: true, agent_ids: [] };

    const result = await loadAddedAgent(
      {
        req: {
          user: { id: 'user123' },
          config: {
            config: {},
            fileStrategy: FileSources.local,
            imageOutputType: 'png',
            modelSpecs: {
              list: [
                {
                  name: 'mirrored-scoped-skills',
                  label: 'Mirrored Scoped Skills',
                  preset: { endpoint: 'openai', model: 'gpt-4' },
                  skills: ['brand-writer'],
                  subagents,
                },
              ],
            },
          },
        },
        conversation: {
          endpoint: 'openai',
          model: 'gpt-4',
          spec: 'mirrored-scoped-skills',
        } as unknown as TConversation,
        primaryAgent: { id: EPHEMERAL_AGENT_ID as string, tools: ['web_search'] } as LibreChatAgent,
      },
      deps,
    );

    expect(result?.tools).toEqual(['web_search']);
    expect(result?.skills_enabled).toBe(true);
    expect(result?.skills).toEqual([]);
    expect(result?.subagents).toEqual(subagents);
  });

  test('should equip ask_user_question for added agents from a model spec', async () => {
    const result = await loadAddedAgent(
      {
        req: {
          user: { id: 'user123' },
          config: {
            config: {},
            fileStrategy: FileSources.local,
            imageOutputType: 'png',
            modelSpecs: {
              list: [
                {
                  name: 'added-asks',
                  label: 'Added Asks',
                  preset: { endpoint: 'openai', model: 'gpt-4' },
                  askUserQuestion: true,
                },
              ],
            },
          },
        },
        conversation: {
          endpoint: 'openai',
          model: 'gpt-4',
          spec: 'added-asks',
        } as unknown as TConversation,
      },
      deps,
    );

    expect(result?.tools).toContain('ask_user_question');
  });

  test('should equip ask_user_question for added agents from the ephemeralAgent flag', async () => {
    const result = await loadAddedAgent(
      {
        req: {
          user: { id: 'user123' },
          config: {
            config: {},
            fileStrategy: FileSources.local,
            imageOutputType: 'png',
          },
        },
        conversation: {
          endpoint: 'openai',
          model: 'gpt-4',
          ephemeralAgent: { ask_user_question: true },
        } as unknown as TConversation,
      },
      deps,
    );

    expect(result?.tools).toContain('ask_user_question');
  });

  test('should handle ephemeral agent with undefined ephemeralAgent in body', async () => {
    const { EPHEMERAL_AGENT_ID } = Constants;

    const mockReq = {
      user: { id: 'user123' },
      body: {
        promptPrefix: 'Basic instructions',
      },
    };

    const result = await loadAgent(
      {
        req: mockReq,
        agent_id: EPHEMERAL_AGENT_ID as string,
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4' } as unknown as AgentModelParameters,
      },
      deps,
    );

    if (result) {
      expect(result.tools).toEqual([]);
    } else {
      expect(result).toBeFalsy();
    }
  });

  describe('Edge Cases', () => {
    test('should handle loadAgent with malformed req object', async () => {
      const result = await loadAgent(
        {
          req: null as unknown as LoadAgentParams['req'],
          agent_id: 'agent_test',
          endpoint: 'openai',
          model_parameters: { model: 'gpt-4' } as unknown as AgentModelParameters,
        },
        deps,
      );

      expect(result).toBeNull();
    });

    test('should handle ephemeral agent with extremely large tool list', async () => {
      const { EPHEMERAL_AGENT_ID } = Constants;

      const largeToolList = Array.from({ length: 100 }, (_, i) => `tool_${i}_mcp_server1`);
      const availableTools: Record<string, object> = {};
      for (const tool of largeToolList) {
        availableTools[tool] = {};
      }

      // Mock getMCPServerTools to return all tools for server1
      mockGetMCPServerTools.mockImplementation(async (_userId: string, server: string) => {
        if (server === 'server1') {
          return availableTools; // All 100 tools belong to server1
        }
        return null;
      });

      const mockReq = {
        user: { id: 'user123' },
        body: {
          promptPrefix: 'Test',
          ephemeralAgent: {
            execute_code: true,
            web_search: true,
            mcp: ['server1'],
          },
        },
      };

      const result = await loadAgent(
        {
          req: mockReq,
          agent_id: EPHEMERAL_AGENT_ID as string,
          endpoint: 'openai',
          model_parameters: { model: 'gpt-4' } as unknown as AgentModelParameters,
        },
        deps,
      );

      if (result) {
        expect(result.tools!.length).toBeGreaterThan(100);
      }
    });

    test('should return agent from different project (permissions checked at route level)', async () => {
      const authorId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const agentId = `agent_${uuidv4()}`;

      await createAgent({
        id: agentId,
        name: 'Project Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
      });

      const mockReq = { user: { id: userId.toString() } };
      const result = await loadAgent(
        {
          req: mockReq,
          agent_id: agentId,
          endpoint: 'openai',
          model_parameters: { model: 'gpt-4' } as unknown as AgentModelParameters,
        },
        deps,
      );

      // With the new permission system, loadAgent returns the agent regardless of permissions
      // Permission checks are handled at the route level via middleware
      expect(result).toBeTruthy();
      expect(result!.id).toBe(agentId);
      expect(result!.name).toBe('Project Agent');
    });

    test('should handle loadEphemeralAgent with malformed MCP tool names', async () => {
      const { EPHEMERAL_AGENT_ID } = Constants;

      // Mock getMCPServerTools to return only tools matching the server
      mockGetMCPServerTools.mockImplementation(async (_userId: string, server: string) => {
        if (server === 'server1') {
          // Only return tool that correctly matches server1 format
          return { tool_mcp_server1: {} };
        } else if (server === 'server2') {
          return { tool_mcp_server2: {} };
        }
        return null;
      });

      const mockReq = {
        user: { id: 'user123' },
        body: {
          promptPrefix: 'Test instructions',
          ephemeralAgent: {
            execute_code: false,
            web_search: false,
            mcp: ['server1'],
          },
        },
      };

      const result = await loadAgent(
        {
          req: mockReq,
          agent_id: EPHEMERAL_AGENT_ID as string,
          endpoint: 'openai',
          model_parameters: { model: 'gpt-4' } as unknown as AgentModelParameters,
        },
        deps,
      );

      if (result) {
        expect(result.tools).toEqual(['tool_mcp_server1']);
        expect(result.tools).not.toContain('malformed_tool_name');
        expect(result.tools).not.toContain('tool__server1');
        expect(result.tools).not.toContain('tool_mcp_server2');
      }
    });
  });
});
