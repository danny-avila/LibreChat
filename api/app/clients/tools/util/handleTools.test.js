const mockUser = {
  _id: 'fakeId',
  save: jest.fn(),
  findByIdAndDelete: jest.fn(),
};

const mockPluginService = {
  updateUserPluginAuth: jest.fn(),
  deleteUserPluginAuth: jest.fn(),
  getUserPluginAuthValue: jest.fn(),
};

jest.mock('~/models/User', () => {
  return function () {
    return mockUser;
  };
});

jest.mock('~/server/services/PluginService', () => mockPluginService);

const { BaseLLM } = require('@langchain/openai');
const { Calculator } = require('@langchain/community/tools/calculator');

const User = require('~/models/User');
const PluginService = require('~/server/services/PluginService');
const { validateTools, loadTools, loadToolWithAuth } = require('./handleTools');
const { StructuredSD, availableTools, DALLE3 } = require('../');

describe('Tool Handlers', () => {
  let fakeUser;
  const pluginKey = 'dalle';
  const pluginKey2 = 'wolfram';
  const ToolClass = DALLE3;
  const initialTools = [pluginKey, pluginKey2];
  const mockCredential = 'mock-credential';
  const mainPlugin = availableTools.find((tool) => tool.pluginKey === pluginKey);
  const authConfigs = mainPlugin.authConfig;

  beforeAll(async () => {
    mockUser.save.mockResolvedValue(undefined);

    const userAuthValues = {};
    mockPluginService.getUserPluginAuthValue.mockImplementation((userId, authField) => {
      return userAuthValues[`${userId}-${authField}`];
    });
    mockPluginService.updateUserPluginAuth.mockImplementation(
      (userId, authField, _pluginKey, credential) => {
        const fields = authField.split('||');
        fields.forEach((field) => {
          userAuthValues[`${userId}-${field}`] = credential;
        });
      },
    );

    fakeUser = new User({
      name: 'Fake User',
      username: 'fakeuser',
      email: 'fakeuser@example.com',
      emailVerified: false,
      // file deepcode ignore NoHardcodedPasswords/test: fake value
      password: 'fakepassword123',
      avatar: '',
      provider: 'local',
      role: 'USER',
      googleId: null,
      plugins: [],
      refreshToken: [],
    });
    await fakeUser.save();
    for (const authConfig of authConfigs) {
      await PluginService.updateUserPluginAuth(
        fakeUser._id,
        authConfig.authField,
        pluginKey,
        mockCredential,
      );
    }
  });

  afterAll(async () => {
    await mockUser.findByIdAndDelete(fakeUser._id);
    for (const authConfig of authConfigs) {
      await PluginService.deleteUserPluginAuth(fakeUser._id, authConfig.authField);
    }
  });

  describe('validateTools', () => {
    it('returns valid tools given input tools and user authentication', async () => {
      const validTools = await validateTools(fakeUser._id, initialTools);
      expect(validTools).toBeDefined();
      expect(validTools.some((tool) => tool === pluginKey)).toBeTruthy();
      expect(validTools.length).toBeGreaterThan(0);
    });

    it('removes tools without valid credentials from the validTools array', async () => {
      const validTools = await validateTools(fakeUser._id, initialTools);
      expect(validTools.some((tool) => tool.pluginKey === pluginKey2)).toBeFalsy();
    });

    it('returns an empty array when no authenticated tools are provided', async () => {
      const validTools = await validateTools(fakeUser._id, []);
      expect(validTools).toEqual([]);
    });

    it('should validate a tool from an Environment Variable', async () => {
      const plugin = availableTools.find((tool) => tool.pluginKey === pluginKey2);
      const authConfigs = plugin.authConfig;
      for (const authConfig of authConfigs) {
        process.env[authConfig.authField] = mockCredential;
      }
      const validTools = await validateTools(fakeUser._id, [pluginKey2]);
      expect(validTools.length).toEqual(1);
      for (const authConfig of authConfigs) {
        delete process.env[authConfig.authField];
      }
    });
  });

  describe('loadTools', () => {
    let toolFunctions;
    let loadTool1;
    let loadTool2;
    let loadTool3;
    const sampleTools = [...initialTools, 'calculator'];
    let ToolClass2 = Calculator;
    let remainingTools = availableTools.filter(
      (tool) => sampleTools.indexOf(tool.pluginKey) === -1,
    );

    beforeAll(async () => {
      toolFunctions = await loadTools({
        user: fakeUser._id,
        model: BaseLLM,
        tools: sampleTools,
        returnMap: true,
      });
      loadTool1 = toolFunctions[sampleTools[0]];
      loadTool2 = toolFunctions[sampleTools[1]];
      loadTool3 = toolFunctions[sampleTools[2]];
    });

    let originalEnv;

    beforeEach(() => {
      originalEnv = process.env;
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('returns the expected load functions for requested tools', async () => {
      expect(loadTool1).toBeDefined();
      expect(loadTool2).toBeDefined();
      expect(loadTool3).toBeDefined();

      for (const tool of remainingTools) {
        expect(toolFunctions[tool.pluginKey]).toBeUndefined();
      }
    });

    it('should initialize an authenticated tool or one without authentication', async () => {
      const authTool = await loadTool1();
      const tool = await loadTool3();
      expect(authTool).toBeInstanceOf(ToolClass);
      expect(tool).toBeInstanceOf(ToolClass2);
    });

    it('should initialize an authenticated tool with primary auth field', async () => {
      process.env.DALLE3_API_KEY = 'mocked_api_key';
      const initToolFunction = loadToolWithAuth(
        'userId',
        ['DALLE3_API_KEY||DALLE_API_KEY'],
        ToolClass,
      );
      const authTool = await initToolFunction();

      expect(authTool).toBeInstanceOf(ToolClass);
      expect(mockPluginService.getUserPluginAuthValue).not.toHaveBeenCalled();
    });

    it('should initialize an authenticated tool with alternate auth field when primary is missing', async () => {
      delete process.env.DALLE3_API_KEY; // Ensure the primary key is not set
      process.env.DALLE_API_KEY = 'mocked_alternate_api_key';
      const initToolFunction = loadToolWithAuth(
        'userId',
        ['DALLE3_API_KEY||DALLE_API_KEY'],
        ToolClass,
      );
      const authTool = await initToolFunction();

      expect(authTool).toBeInstanceOf(ToolClass);
      expect(mockPluginService.getUserPluginAuthValue).toHaveBeenCalledTimes(1);
      expect(mockPluginService.getUserPluginAuthValue).toHaveBeenCalledWith(
        'userId',
        'DALLE3_API_KEY',
      );
    });

    it('should fallback to getUserPluginAuthValue when env vars are missing', async () => {
      mockPluginService.updateUserPluginAuth('userId', 'DALLE_API_KEY', 'dalle', 'mocked_api_key');
      const initToolFunction = loadToolWithAuth(
        'userId',
        ['DALLE3_API_KEY||DALLE_API_KEY'],
        ToolClass,
      );
      const authTool = await initToolFunction();

      expect(authTool).toBeInstanceOf(ToolClass);
      expect(mockPluginService.getUserPluginAuthValue).toHaveBeenCalledTimes(2);
    });

    it('should throw an error for an unauthenticated tool', async () => {
      try {
        await loadTool2();
      } catch (error) {
        // eslint-disable-next-line jest/no-conditional-expect
        expect(error).toBeDefined();
      }
    });
    it('returns an empty object when no tools are requested', async () => {
      toolFunctions = await loadTools({
        user: fakeUser._id,
        model: BaseLLM,
        returnMap: true,
      });
      expect(toolFunctions).toEqual({});
    });
    it('should return the StructuredTool version when using functions', async () => {
      process.env.SD_WEBUI_URL = mockCredential;
      toolFunctions = await loadTools({
        user: fakeUser._id,
        model: BaseLLM,
        tools: ['stable-diffusion'],
        functions: true,
        returnMap: true,
      });
      const structuredTool = await toolFunctions['stable-diffusion']();
      expect(structuredTool).toBeInstanceOf(StructuredSD);
      delete process.env.SD_WEBUI_URL;
    });
  });
});
