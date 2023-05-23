/* eslint-disable jest/no-conditional-expect */
require('dotenv').config({ path: '../../../.env' });
const mongoose = require('mongoose');
const User = require('../../../models/User');
const connectDb = require('../../../lib/db/connectDb');
const { validateTools, loadTools, availableTools } = require('./index');
const PluginService = require('../../../server/services/PluginService');
const { BaseChatModel } = require('langchain/chat_models/openai');
const { Calculator } = require('langchain/tools/calculator');
const OpenAICreateImage = require('./openaiCreateImage');

describe('Tool Handlers', () => {
  let fakeUser;
  let pluginKey = 'dall-e';
  let authField = 'DALLE_API_KEY';
  let sampleTools = [pluginKey, 'wolfram'];
  let ToolClass = OpenAICreateImage;
  let mockCredential = 'mock-credential';

  beforeAll(async () => {
    await connectDb();
    fakeUser = new User({
      name: 'Fake User',
      username: 'fakeuser',
      email: 'fakeuser@example.com',
      emailVerified: false,
      password: 'fakepassword123',
      avatar: '',
      provider: 'local',
      role: 'USER',
      googleId: null,
      plugins: [],
      refreshToken: []
    });
    await fakeUser.save();
    await PluginService.updateUserPluginAuth(fakeUser._id, authField, pluginKey, mockCredential);
  });

  // afterEach(async () => {
  //   // Clean up any test-specific data.
  // });

  afterAll(async () => {
    // Delete the fake user & plugin auth
    await User.findByIdAndDelete(fakeUser._id);
    await PluginService.deleteUserPluginAuth(fakeUser._id, authField);
    await mongoose.connection.close();
  });

  describe('validateTools', () => {
    it('returns valid tools given input tools and user authentication', async () => {
      const validTools = await validateTools(fakeUser._id, sampleTools);
      expect(validTools).toBeDefined();
      expect(validTools.some((tool) => tool === 'dall-e')).toBeTruthy();
      expect(validTools.some((tool) => tool === 'wolfram')).toBeFalsy();
      expect(validTools.length).toBeGreaterThan(0);
    });

    it('removes tools without valid credentials from the validTools array', async () => {
      const validTools = await validateTools(fakeUser._id, sampleTools);
      expect(validTools.some((tool) => tool.pluginKey === 'wolfram')).toBeFalsy();
    });

    it('returns an empty array when no authenticated tools are provided', async () => {
      const validTools = await validateTools(fakeUser._id, []);
      expect(validTools).toEqual([]);
    });

    it('should validate a tool from an Environment Variable', async () => {
      const testPluginKey = 'wolfram';
      const plugin = availableTools.find((tool) => tool.pluginKey === testPluginKey);
      const authConfigs = plugin.authConfig;
      for (const authConfig of authConfigs) {
        process.env[authConfig.authField] = mockCredential;
      }
      const validTools = await validateTools(fakeUser._id, [testPluginKey]);
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
    sampleTools = [...sampleTools, 'calculator'];
    let remainingTools = availableTools.filter((tool) => sampleTools.indexOf(tool.pluginKey) === -1);

    beforeAll(async () => {
      toolFunctions = await loadTools({
        user: fakeUser._id,
        model: BaseChatModel,
        tools: sampleTools
      });
      loadTool1 = toolFunctions[sampleTools[0]];
      loadTool2 = toolFunctions[sampleTools[1]];
    });
    it('returns the expected load functions for requested tools', async () => {
      expect(loadTool1).toBeDefined();
      expect(loadTool2).toBeDefined();

      for (const tool of remainingTools) {
        expect(toolFunctions[tool.pluginKey]).toBeUndefined();
      }
    });

    it('should initialize an authenticated tool or one without authentication', async () => {
      const authTool = await loadTool1();
      const calculator = toolFunctions.calculator();
      expect(authTool).toBeInstanceOf(ToolClass);
      expect(calculator).toBeInstanceOf(Calculator);
    });
    it('should throw an error for an unauthenticated tool', async () => {
      try {
        await loadTool2();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
    it('returns an empty object when no tools are requested', async () => {
      toolFunctions = await loadTools({
        user: fakeUser._id,
        model: BaseChatModel
      });
      expect(toolFunctions).toEqual({});
    });
  });
});
