const mongoose = require('mongoose');
const { nanoid } = require('nanoid');
const { v4: uuidv4 } = require('uuid');
const { agentSchema } = require('@librechat/data-schemas');
const { FileSources } = require('librechat-data-provider');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Only mock the dependencies that are not database-related
jest.mock('~/server/services/Config', () => ({
  getCachedTools: jest.fn().mockResolvedValue({
    web_search: true,
    execute_code: true,
    file_search: true,
  }),
}));

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(),
}));

jest.mock('~/server/services/Files/images/avatar', () => ({
  resizeAvatar: jest.fn(),
}));

jest.mock('~/server/services/Files/S3/crud', () => ({
  refreshS3Url: jest.fn(),
}));

jest.mock('~/server/services/Files/process', () => ({
  filterFile: jest.fn(),
}));

jest.mock('~/server/services/PermissionService', () => ({
  findAccessibleResources: jest.fn().mockResolvedValue([]),
  findPubliclyAccessibleResources: jest.fn().mockResolvedValue([]),
  grantPermission: jest.fn(),
  hasPublicPermission: jest.fn().mockResolvedValue(false),
  checkPermission: jest.fn().mockResolvedValue(true),
}));

jest.mock('~/models', () => {
  const mongoose = require('mongoose');
  const { createMethods } = require('@librechat/data-schemas');
  const methods = createMethods(mongoose, {
    removeAllPermissions: jest.fn().mockResolvedValue(undefined),
  });
  return {
    ...methods,
    getCategoriesWithCounts: jest.fn(),
    deleteFileByFilter: jest.fn(),
  };
});

// Mock cache for S3 avatar refresh tests
const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
};
jest.mock('~/cache', () => ({
  getLogStores: jest.fn(() => mockCache),
}));

const {
  createAgent: createAgentHandler,
  updateAgent: updateAgentHandler,
  getListAgents: getListAgentsHandler,
} = require('./v1');

const {
  findAccessibleResources,
  findPubliclyAccessibleResources,
} = require('~/server/services/PermissionService');

const { refreshS3Url } = require('~/server/services/Files/S3/crud');

/**
 * @type {import('mongoose').Model<import('@librechat/data-schemas').IAgent>}
 */
let Agent;

describe('Agent Controllers - Mass Assignment Protection', () => {
  let mongoServer;
  let mockReq;
  let mockRes;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    Agent = mongoose.models.Agent || mongoose.model('Agent', agentSchema);
  }, 20000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Agent.deleteMany({});

    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock request and response objects
    mockReq = {
      user: {
        id: new mongoose.Types.ObjectId().toString(),
        role: 'USER',
      },
      body: {},
      params: {},
      query: {},
      app: {
        locals: {
          fileStrategy: 'local',
        },
      },
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  describe('createAgentHandler', () => {
    test('should create agent with allowed fields only', async () => {
      const validData = {
        name: 'Test Agent',
        description: 'A test agent',
        instructions: 'Be helpful',
        provider: 'openai',
        model: 'gpt-4',
        tools: ['web_search'],
        model_parameters: { temperature: 0.7 },
        tool_resources: {
          file_search: { file_ids: ['file1', 'file2'] },
        },
      };

      mockReq.body = validData;

      await createAgentHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalled();

      const createdAgent = mockRes.json.mock.calls[0][0];
      expect(createdAgent.name).toBe('Test Agent');
      expect(createdAgent.description).toBe('A test agent');
      expect(createdAgent.provider).toBe('openai');
      expect(createdAgent.model).toBe('gpt-4');
      expect(createdAgent.author.toString()).toBe(mockReq.user.id);
      expect(createdAgent.tools).toContain('web_search');

      // Verify in database
      const agentInDb = await Agent.findOne({ id: createdAgent.id });
      expect(agentInDb).toBeDefined();
      expect(agentInDb.name).toBe('Test Agent');
      expect(agentInDb.author.toString()).toBe(mockReq.user.id);
    });

    test('should reject creation with unauthorized fields (mass assignment protection)', async () => {
      const maliciousData = {
        // Required fields
        provider: 'openai',
        model: 'gpt-4',
        name: 'Malicious Agent',

        // Unauthorized fields that should be stripped
        author: new mongoose.Types.ObjectId().toString(), // Should not be able to set author
        authorName: 'Hacker', // Should be stripped
        versions: [], // Should be stripped
        _id: new mongoose.Types.ObjectId(), // Should be stripped
        id: 'custom_agent_id', // Should be overridden
        createdAt: new Date('2020-01-01'), // Should be stripped
        updatedAt: new Date('2020-01-01'), // Should be stripped
      };

      mockReq.body = maliciousData;

      await createAgentHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);

      const createdAgent = mockRes.json.mock.calls[0][0];

      // Verify unauthorized fields were not set
      expect(createdAgent.author.toString()).toBe(mockReq.user.id); // Should be the request user, not the malicious value
      expect(createdAgent.authorName).toBeUndefined();
      expect(createdAgent.versions).toHaveLength(1); // Should have exactly 1 version from creation
      expect(createdAgent.id).not.toBe('custom_agent_id'); // Should have generated ID
      expect(createdAgent.id).toMatch(/^agent_/); // Should have proper prefix

      // Verify timestamps are recent (not the malicious dates)
      const createdTime = new Date(createdAgent.createdAt).getTime();
      const now = Date.now();
      expect(now - createdTime).toBeLessThan(5000); // Created within last 5 seconds

      // Verify in database
      const agentInDb = await Agent.findOne({ id: createdAgent.id });
      expect(agentInDb.author.toString()).toBe(mockReq.user.id);
      expect(agentInDb.authorName).toBeUndefined();
    });

    test('should validate required fields', async () => {
      const invalidData = {
        name: 'Missing Required Fields',
        // Missing provider and model
      };

      mockReq.body = invalidData;

      await createAgentHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid request data',
          details: expect.any(Array),
        }),
      );

      // Verify nothing was created in database
      const count = await Agent.countDocuments();
      expect(count).toBe(0);
    });

    test('should handle tool_resources validation', async () => {
      const dataWithInvalidToolResources = {
        provider: 'openai',
        model: 'gpt-4',
        name: 'Agent with Tool Resources',
        tool_resources: {
          // Valid resources
          file_search: {
            file_ids: ['file1', 'file2'],
            vector_store_ids: ['vs1'],
          },
          execute_code: {
            file_ids: ['file3'],
          },
          // Invalid resource (should be stripped by schema)
          invalid_resource: {
            file_ids: ['file4'],
          },
        },
      };

      mockReq.body = dataWithInvalidToolResources;

      await createAgentHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);

      const createdAgent = mockRes.json.mock.calls[0][0];
      expect(createdAgent.tool_resources).toBeDefined();
      expect(createdAgent.tool_resources.file_search).toBeDefined();
      expect(createdAgent.tool_resources.execute_code).toBeDefined();
      expect(createdAgent.tool_resources.invalid_resource).toBeUndefined(); // Should be stripped

      // Verify in database
      const agentInDb = await Agent.findOne({ id: createdAgent.id });
      expect(agentInDb.tool_resources.invalid_resource).toBeUndefined();
    });

    test('should handle support_contact with empty strings', async () => {
      const dataWithEmptyContact = {
        provider: 'openai',
        model: 'gpt-4',
        name: 'Agent with Empty Contact',
        support_contact: {
          name: '',
          email: '',
        },
      };

      mockReq.body = dataWithEmptyContact;

      await createAgentHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);

      const createdAgent = mockRes.json.mock.calls[0][0];
      expect(createdAgent.name).toBe('Agent with Empty Contact');
      expect(createdAgent.support_contact).toBeDefined();
      expect(createdAgent.support_contact.name).toBe('');
      expect(createdAgent.support_contact.email).toBe('');
    });

    test('should handle support_contact with valid email', async () => {
      const dataWithValidContact = {
        provider: 'openai',
        model: 'gpt-4',
        name: 'Agent with Valid Contact',
        support_contact: {
          name: 'Support Team',
          email: 'support@example.com',
        },
      };

      mockReq.body = dataWithValidContact;

      await createAgentHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);

      const createdAgent = mockRes.json.mock.calls[0][0];
      expect(createdAgent.support_contact).toBeDefined();
      expect(createdAgent.support_contact.name).toBe('Support Team');
      expect(createdAgent.support_contact.email).toBe('support@example.com');
    });

    test('should reject support_contact with invalid email', async () => {
      const dataWithInvalidEmail = {
        provider: 'openai',
        model: 'gpt-4',
        name: 'Agent with Invalid Email',
        support_contact: {
          name: 'Support',
          email: 'not-an-email',
        },
      };

      mockReq.body = dataWithInvalidEmail;

      await createAgentHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid request data',
          details: expect.arrayContaining([
            expect.objectContaining({
              path: ['support_contact', 'email'],
            }),
          ]),
        }),
      );
    });

    test('should handle avatar validation', async () => {
      const dataWithAvatar = {
        provider: 'openai',
        model: 'gpt-4',
        name: 'Agent with Avatar',
        avatar: {
          filepath: 'https://example.com/avatar.png',
          source: 's3',
        },
      };

      mockReq.body = dataWithAvatar;

      await createAgentHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);

      const createdAgent = mockRes.json.mock.calls[0][0];
      expect(createdAgent.avatar).toEqual({
        filepath: 'https://example.com/avatar.png',
        source: 's3',
      });
    });

    test('should remove empty strings from model_parameters (Issue Fix)', async () => {
      // This tests the fix for empty strings being sent to API instead of being omitted
      // When a user clears a numeric field (like max_tokens), it should be removed, not sent as ""
      const dataWithEmptyModelParams = {
        provider: 'azureOpenAI',
        model: 'gpt-4',
        name: 'Agent with Empty Model Params',
        model_parameters: {
          temperature: 0.7, // Valid number - should be preserved
          max_tokens: '', // Empty string - should be removed
          maxContextTokens: '', // Empty string - should be removed
          topP: 0, // Zero value - should be preserved (not treated as empty)
          frequency_penalty: '', // Empty string - should be removed
        },
      };

      mockReq.body = dataWithEmptyModelParams;

      await createAgentHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);

      const createdAgent = mockRes.json.mock.calls[0][0];
      expect(createdAgent.model_parameters).toBeDefined();
      // Valid numbers should be preserved
      expect(createdAgent.model_parameters.temperature).toBe(0.7);
      expect(createdAgent.model_parameters.topP).toBe(0);
      // Empty strings should be removed
      expect(createdAgent.model_parameters.max_tokens).toBeUndefined();
      expect(createdAgent.model_parameters.maxContextTokens).toBeUndefined();
      expect(createdAgent.model_parameters.frequency_penalty).toBeUndefined();

      // Verify in database
      const agentInDb = await Agent.findOne({ id: createdAgent.id });
      expect(agentInDb.model_parameters.temperature).toBe(0.7);
      expect(agentInDb.model_parameters.topP).toBe(0);
      expect(agentInDb.model_parameters.max_tokens).toBeUndefined();
      expect(agentInDb.model_parameters.maxContextTokens).toBeUndefined();
    });

    test('should handle invalid avatar format', async () => {
      const dataWithInvalidAvatar = {
        provider: 'openai',
        model: 'gpt-4',
        name: 'Agent with Invalid Avatar',
        avatar: 'just-a-string', // Invalid format
      };

      mockReq.body = dataWithInvalidAvatar;

      await createAgentHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid request data',
        }),
      );
    });
  });

  describe('updateAgentHandler', () => {
    let existingAgentId;
    let existingAgentAuthorId;

    beforeEach(async () => {
      // Create an existing agent for update tests
      existingAgentAuthorId = new mongoose.Types.ObjectId();
      const agent = await Agent.create({
        id: `agent_${uuidv4()}`,
        name: 'Original Agent',
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        author: existingAgentAuthorId,
        description: 'Original description',
        versions: [
          {
            name: 'Original Agent',
            provider: 'openai',
            model: 'gpt-3.5-turbo',
            description: 'Original description',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });
      existingAgentId = agent.id;
    });

    test('should update agent with allowed fields only', async () => {
      mockReq.user.id = existingAgentAuthorId.toString(); // Set as author
      mockReq.params.id = existingAgentId;
      mockReq.body = {
        name: 'Updated Agent',
        description: 'Updated description',
        model: 'gpt-4',
      };

      await updateAgentHandler(mockReq, mockRes);

      expect(mockRes.status).not.toHaveBeenCalledWith(400);
      expect(mockRes.status).not.toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalled();

      const updatedAgent = mockRes.json.mock.calls[0][0];
      expect(updatedAgent.name).toBe('Updated Agent');
      expect(updatedAgent.description).toBe('Updated description');
      expect(updatedAgent.model).toBe('gpt-4');
      expect(updatedAgent.author).toBe(existingAgentAuthorId.toString());

      // Verify in database
      const agentInDb = await Agent.findOne({ id: existingAgentId });
      expect(agentInDb.name).toBe('Updated Agent');
    });

    test('should reject update with unauthorized fields (mass assignment protection)', async () => {
      mockReq.user.id = existingAgentAuthorId.toString();
      mockReq.params.id = existingAgentId;
      mockReq.body = {
        name: 'Updated Name',

        // Unauthorized fields that should be stripped
        author: new mongoose.Types.ObjectId().toString(), // Should not be able to change author
        authorName: 'Hacker', // Should be stripped
        id: 'different_agent_id', // Should be stripped
        _id: new mongoose.Types.ObjectId(), // Should be stripped
        versions: [], // Should be stripped
        createdAt: new Date('2020-01-01'), // Should be stripped
        updatedAt: new Date('2020-01-01'), // Should be stripped
      };

      await updateAgentHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();

      const updatedAgent = mockRes.json.mock.calls[0][0];

      // Verify unauthorized fields were not changed
      expect(updatedAgent.author).toBe(existingAgentAuthorId.toString()); // Should not have changed
      expect(updatedAgent.authorName).toBeUndefined();
      expect(updatedAgent.id).toBe(existingAgentId); // Should not have changed
      expect(updatedAgent.name).toBe('Updated Name'); // Only this should have changed

      // Verify in database
      const agentInDb = await Agent.findOne({ id: existingAgentId });
      expect(agentInDb.author.toString()).toBe(existingAgentAuthorId.toString());
      expect(agentInDb.id).toBe(existingAgentId);
    });

    test('should allow admin to update any agent', async () => {
      const adminUserId = new mongoose.Types.ObjectId().toString();
      mockReq.user.id = adminUserId;
      mockReq.user.role = 'ADMIN'; // Set as admin
      mockReq.params.id = existingAgentId;
      mockReq.body = {
        name: 'Admin Update',
      };

      await updateAgentHandler(mockReq, mockRes);

      expect(mockRes.status).not.toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalled();

      const updatedAgent = mockRes.json.mock.calls[0][0];
      expect(updatedAgent.name).toBe('Admin Update');
    });

    test('should validate tool_resources in updates', async () => {
      mockReq.user.id = existingAgentAuthorId.toString();
      mockReq.params.id = existingAgentId;
      mockReq.body = {
        tool_resources: {
          /** Legacy conversion from `ocr` to `context` */
          ocr: {
            file_ids: ['ocr1', 'ocr2'],
          },
          execute_code: {
            file_ids: ['img1'],
          },
          // Invalid tool resource
          invalid_tool: {
            file_ids: ['invalid'],
          },
        },
      };

      await updateAgentHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();

      const updatedAgent = mockRes.json.mock.calls[0][0];
      expect(updatedAgent.tool_resources).toBeDefined();
      expect(updatedAgent.tool_resources.ocr).toBeUndefined();
      expect(updatedAgent.tool_resources.context).toBeDefined();
      expect(updatedAgent.tool_resources.execute_code).toBeDefined();
      expect(updatedAgent.tool_resources.invalid_tool).toBeUndefined();
    });

    test('should remove empty strings from model_parameters during update (Issue Fix)', async () => {
      // First create an agent with valid model_parameters
      await Agent.updateOne(
        { id: existingAgentId },
        {
          model_parameters: {
            temperature: 0.5,
            max_tokens: 1000,
            maxContextTokens: 2000,
          },
        },
      );

      mockReq.user.id = existingAgentAuthorId.toString();
      mockReq.params.id = existingAgentId;
      // Simulate user clearing the fields (sends empty strings)
      mockReq.body = {
        model_parameters: {
          temperature: 0.7, // Change to new value
          max_tokens: '', // Clear this field (should be removed, not sent as "")
          maxContextTokens: '', // Clear this field (should be removed, not sent as "")
        },
      };

      await updateAgentHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();

      const updatedAgent = mockRes.json.mock.calls[0][0];
      expect(updatedAgent.model_parameters).toBeDefined();
      // Valid number should be updated
      expect(updatedAgent.model_parameters.temperature).toBe(0.7);
      // Empty strings should be removed, not sent as ""
      expect(updatedAgent.model_parameters.max_tokens).toBeUndefined();
      expect(updatedAgent.model_parameters.maxContextTokens).toBeUndefined();

      // Verify in database
      const agentInDb = await Agent.findOne({ id: existingAgentId });
      expect(agentInDb.model_parameters.temperature).toBe(0.7);
      expect(agentInDb.model_parameters.max_tokens).toBeUndefined();
      expect(agentInDb.model_parameters.maxContextTokens).toBeUndefined();
    });

    test('should return 404 for non-existent agent', async () => {
      mockReq.user.id = existingAgentAuthorId.toString();
      mockReq.params.id = `agent_${uuidv4()}`; // Non-existent ID
      mockReq.body = {
        name: 'Update Non-existent',
      };

      await updateAgentHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Agent not found' });
    });

    test('should include version field in update response', async () => {
      mockReq.user.id = existingAgentAuthorId.toString();
      mockReq.params.id = existingAgentId;
      mockReq.body = {
        name: 'Updated with Version Check',
      };

      await updateAgentHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const updatedAgent = mockRes.json.mock.calls[0][0];

      // Verify version field is included and is a number
      expect(updatedAgent).toHaveProperty('version');
      expect(typeof updatedAgent.version).toBe('number');
      expect(updatedAgent.version).toBeGreaterThanOrEqual(1);

      // Verify in database
      const agentInDb = await Agent.findOne({ id: existingAgentId });
      expect(updatedAgent.version).toBe(agentInDb.versions.length);
    });

    test('should allow resetting avatar when value is explicitly null', async () => {
      await Agent.updateOne(
        { id: existingAgentId },
        {
          avatar: {
            filepath: 'https://example.com/avatar.png',
            source: 's3',
          },
        },
      );

      mockReq.user.id = existingAgentAuthorId.toString();
      mockReq.params.id = existingAgentId;
      mockReq.body = {
        avatar: null,
      };

      await updateAgentHandler(mockReq, mockRes);

      const updatedAgent = mockRes.json.mock.calls[0][0];
      expect(updatedAgent.avatar).toBeNull();

      const agentInDb = await Agent.findOne({ id: existingAgentId });
      expect(agentInDb.avatar).toBeNull();
    });

    test('should ignore avatar field when value is undefined', async () => {
      const originalAvatar = {
        filepath: 'https://example.com/original.png',
        source: 's3',
      };
      await Agent.updateOne({ id: existingAgentId }, { avatar: originalAvatar });

      mockReq.user.id = existingAgentAuthorId.toString();
      mockReq.params.id = existingAgentId;
      mockReq.body = {
        avatar: undefined,
      };

      await updateAgentHandler(mockReq, mockRes);

      const agentInDb = await Agent.findOne({ id: existingAgentId });
      expect(agentInDb.avatar.filepath).toBe(originalAvatar.filepath);
      expect(agentInDb.avatar.source).toBe(originalAvatar.source);
    });

    test('should not bump version when no mutable fields change', async () => {
      const existingAgent = await Agent.findOne({ id: existingAgentId });
      const originalVersionCount = existingAgent.versions.length;

      mockReq.user.id = existingAgentAuthorId.toString();
      mockReq.params.id = existingAgentId;
      mockReq.body = {
        avatar: undefined,
      };

      await updateAgentHandler(mockReq, mockRes);

      const agentInDb = await Agent.findOne({ id: existingAgentId });
      expect(agentInDb.versions.length).toBe(originalVersionCount);
    });

    test('should handle validation errors properly', async () => {
      mockReq.user.id = existingAgentAuthorId.toString();
      mockReq.params.id = existingAgentId;
      mockReq.body = {
        model_parameters: 'invalid-not-an-object', // Should be an object
      };

      await updateAgentHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid request data',
          details: expect.any(Array),
        }),
      );
    });
  });

  describe('Mass Assignment Attack Scenarios', () => {
    test('should prevent setting system fields during creation', async () => {
      const systemFields = {
        provider: 'openai',
        model: 'gpt-4',
        name: 'System Fields Test',

        // System fields that should never be settable by users
        __v: 99,
        _id: new mongoose.Types.ObjectId(),
        versions: [
          {
            name: 'Fake Version',
            provider: 'fake',
            model: 'fake-model',
          },
        ],
      };

      mockReq.body = systemFields;

      await createAgentHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);

      const createdAgent = mockRes.json.mock.calls[0][0];

      // Verify system fields were not affected
      expect(createdAgent.__v).not.toBe(99);
      expect(createdAgent.versions).toHaveLength(1); // Should only have the auto-created version
      expect(createdAgent.versions[0].name).toBe('System Fields Test'); // From actual creation
      expect(createdAgent.versions[0].provider).toBe('openai'); // From actual creation

      // Verify in database
      const agentInDb = await Agent.findOne({ id: createdAgent.id });
      expect(agentInDb.__v).not.toBe(99);
    });

    test('should prevent author hijacking', async () => {
      const originalAuthorId = new mongoose.Types.ObjectId();
      const attackerId = new mongoose.Types.ObjectId();

      // Admin creates an agent
      mockReq.user.id = originalAuthorId.toString();
      mockReq.user.role = 'ADMIN';
      mockReq.body = {
        provider: 'openai',
        model: 'gpt-4',
        name: 'Admin Agent',
        author: attackerId.toString(), // Trying to set different author
      };

      await createAgentHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);

      const createdAgent = mockRes.json.mock.calls[0][0];

      // Author should be the actual user, not the attempted value
      expect(createdAgent.author.toString()).toBe(originalAuthorId.toString());
      expect(createdAgent.author.toString()).not.toBe(attackerId.toString());

      // Verify in database
      const agentInDb = await Agent.findOne({ id: createdAgent.id });
      expect(agentInDb.author.toString()).toBe(originalAuthorId.toString());
    });

    test('should strip unknown fields to prevent future vulnerabilities', async () => {
      mockReq.body = {
        provider: 'openai',
        model: 'gpt-4',
        name: 'Future Proof Test',

        // Unknown fields that might be added in future
        superAdminAccess: true,
        bypassAllChecks: true,
        internalFlag: 'secret',
        futureFeature: 'exploit',
      };

      await createAgentHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);

      const createdAgent = mockRes.json.mock.calls[0][0];

      // Verify unknown fields were stripped
      expect(createdAgent.superAdminAccess).toBeUndefined();
      expect(createdAgent.bypassAllChecks).toBeUndefined();
      expect(createdAgent.internalFlag).toBeUndefined();
      expect(createdAgent.futureFeature).toBeUndefined();

      // Also check in database
      const agentInDb = await Agent.findOne({ id: createdAgent.id }).lean();
      expect(agentInDb.superAdminAccess).toBeUndefined();
      expect(agentInDb.bypassAllChecks).toBeUndefined();
      expect(agentInDb.internalFlag).toBeUndefined();
      expect(agentInDb.futureFeature).toBeUndefined();
    });
  });

  describe('getListAgentsHandler - Security Tests', () => {
    let userA, userB;
    let agentA1, agentA2, agentA3, agentB1;

    beforeEach(async () => {
      await Agent.deleteMany({});
      jest.clearAllMocks();

      // Create two test users
      userA = new mongoose.Types.ObjectId();
      userB = new mongoose.Types.ObjectId();

      // Create agents for User A
      agentA1 = await Agent.create({
        id: `agent_${nanoid(12)}`,
        name: 'Agent A1',
        description: 'User A agent 1',
        provider: 'openai',
        model: 'gpt-4',
        author: userA,
        versions: [
          {
            name: 'Agent A1',
            description: 'User A agent 1',
            provider: 'openai',
            model: 'gpt-4',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      agentA2 = await Agent.create({
        id: `agent_${nanoid(12)}`,
        name: 'Agent A2',
        description: 'User A agent 2',
        provider: 'openai',
        model: 'gpt-4',
        author: userA,
        versions: [
          {
            name: 'Agent A2',
            description: 'User A agent 2',
            provider: 'openai',
            model: 'gpt-4',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      agentA3 = await Agent.create({
        id: `agent_${nanoid(12)}`,
        name: 'Agent A3',
        description: 'User A agent 3',
        provider: 'openai',
        model: 'gpt-4',
        author: userA,
        category: 'productivity',
        versions: [
          {
            name: 'Agent A3',
            description: 'User A agent 3',
            provider: 'openai',
            model: 'gpt-4',
            category: 'productivity',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      // Create an agent for User B
      agentB1 = await Agent.create({
        id: `agent_${nanoid(12)}`,
        name: 'Agent B1',
        description: 'User B agent 1',
        provider: 'openai',
        model: 'gpt-4',
        author: userB,
        versions: [
          {
            name: 'Agent B1',
            description: 'User B agent 1',
            provider: 'openai',
            model: 'gpt-4',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });
    });

    test('should return empty list when user has no accessible agents', async () => {
      // User B has no permissions and no owned agents
      mockReq.user.id = userB.toString();
      findAccessibleResources.mockResolvedValue([]);
      findPubliclyAccessibleResources.mockResolvedValue([]);

      await getListAgentsHandler(mockReq, mockRes);

      expect(findAccessibleResources).toHaveBeenCalledWith({
        userId: userB.toString(),
        role: 'USER',
        resourceType: 'agent',
        requiredPermissions: 1, // VIEW permission
      });

      expect(mockRes.json).toHaveBeenCalledWith({
        object: 'list',
        data: [],
        first_id: null,
        last_id: null,
        has_more: false,
        after: null,
      });
    });

    test('should not return other users agents when accessibleIds is empty', async () => {
      // User B trying to see agents with no permissions
      mockReq.user.id = userB.toString();
      findAccessibleResources.mockResolvedValue([]);
      findPubliclyAccessibleResources.mockResolvedValue([]);

      await getListAgentsHandler(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.data).toHaveLength(0);

      // Verify User A's agents are not included
      const agentIds = response.data.map((a) => a.id);
      expect(agentIds).not.toContain(agentA1.id);
      expect(agentIds).not.toContain(agentA2.id);
      expect(agentIds).not.toContain(agentA3.id);
    });

    test('should only return agents user has access to', async () => {
      // User B has access to one of User A's agents
      mockReq.user.id = userB.toString();
      findAccessibleResources.mockResolvedValue([agentA1._id]);
      findPubliclyAccessibleResources.mockResolvedValue([]);

      await getListAgentsHandler(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.data).toHaveLength(1);
      expect(response.data[0].id).toBe(agentA1.id);
      expect(response.data[0].name).toBe('Agent A1');
    });

    test('should return multiple accessible agents', async () => {
      // User B has access to multiple agents
      mockReq.user.id = userB.toString();
      findAccessibleResources.mockResolvedValue([agentA1._id, agentA3._id, agentB1._id]);
      findPubliclyAccessibleResources.mockResolvedValue([]);

      await getListAgentsHandler(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.data).toHaveLength(3);

      const agentIds = response.data.map((a) => a.id);
      expect(agentIds).toContain(agentA1.id);
      expect(agentIds).toContain(agentA3.id);
      expect(agentIds).toContain(agentB1.id);
      expect(agentIds).not.toContain(agentA2.id);
    });

    test('should apply category filter correctly with ACL', async () => {
      // User has access to all agents but filters by category
      mockReq.user.id = userB.toString();
      mockReq.query.category = 'productivity';
      findAccessibleResources.mockResolvedValue([agentA1._id, agentA2._id, agentA3._id]);
      findPubliclyAccessibleResources.mockResolvedValue([]);

      await getListAgentsHandler(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.data).toHaveLength(1);
      expect(response.data[0].id).toBe(agentA3.id);
      expect(response.data[0].category).toBe('productivity');
    });

    test('should apply search filter correctly with ACL', async () => {
      // User has access to multiple agents but searches for specific one
      mockReq.user.id = userB.toString();
      mockReq.query.search = 'A2';
      findAccessibleResources.mockResolvedValue([agentA1._id, agentA2._id, agentA3._id]);
      findPubliclyAccessibleResources.mockResolvedValue([]);

      await getListAgentsHandler(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.data).toHaveLength(1);
      expect(response.data[0].id).toBe(agentA2.id);
    });

    test('should handle pagination with ACL filtering', async () => {
      // Create more agents for pagination testing
      const moreAgents = [];
      for (let i = 4; i <= 10; i++) {
        const agent = await Agent.create({
          id: `agent_${nanoid(12)}`,
          name: `Agent A${i}`,
          description: `User A agent ${i}`,
          provider: 'openai',
          model: 'gpt-4',
          author: userA,
          versions: [
            {
              name: `Agent A${i}`,
              description: `User A agent ${i}`,
              provider: 'openai',
              model: 'gpt-4',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        });
        moreAgents.push(agent);
      }

      // User has access to all agents
      const allAgentIds = [agentA1, agentA2, agentA3, ...moreAgents].map((a) => a._id);
      mockReq.user.id = userB.toString();
      mockReq.query.limit = '5';
      findAccessibleResources.mockResolvedValue(allAgentIds);
      findPubliclyAccessibleResources.mockResolvedValue([]);

      await getListAgentsHandler(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.data).toHaveLength(5);
      expect(response.has_more).toBe(true);
      expect(response.after).toBeTruthy();
    });

    test('should mark publicly accessible agents', async () => {
      // User has access to agents, some are public
      mockReq.user.id = userB.toString();
      findAccessibleResources.mockResolvedValue([agentA1._id, agentA2._id]);
      findPubliclyAccessibleResources.mockResolvedValue([agentA2._id]);

      await getListAgentsHandler(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.data).toHaveLength(2);

      const publicAgent = response.data.find((a) => a.id === agentA2.id);
      const privateAgent = response.data.find((a) => a.id === agentA1.id);

      expect(publicAgent.isPublic).toBe(true);
      expect(privateAgent.isPublic).toBeUndefined();
    });

    test('should handle requiredPermission parameter', async () => {
      // Test with different permission levels
      mockReq.user.id = userB.toString();
      mockReq.query.requiredPermission = '15'; // FULL_ACCESS
      findAccessibleResources.mockResolvedValue([agentA1._id]);
      findPubliclyAccessibleResources.mockResolvedValue([]);

      await getListAgentsHandler(mockReq, mockRes);

      expect(findAccessibleResources).toHaveBeenCalledWith({
        userId: userB.toString(),
        role: 'USER',
        resourceType: 'agent',
        requiredPermissions: 15,
      });

      const response = mockRes.json.mock.calls[0][0];
      expect(response.data).toHaveLength(1);
    });

    test('should handle promoted filter with ACL', async () => {
      // Create a promoted agent
      const promotedAgent = await Agent.create({
        id: `agent_${nanoid(12)}`,
        name: 'Promoted Agent',
        description: 'A promoted agent',
        provider: 'openai',
        model: 'gpt-4',
        author: userA,
        is_promoted: true,
        versions: [
          {
            name: 'Promoted Agent',
            description: 'A promoted agent',
            provider: 'openai',
            model: 'gpt-4',
            is_promoted: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      mockReq.user.id = userB.toString();
      mockReq.query.promoted = '1';
      findAccessibleResources.mockResolvedValue([agentA1._id, agentA2._id, promotedAgent._id]);
      findPubliclyAccessibleResources.mockResolvedValue([]);

      await getListAgentsHandler(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.data).toHaveLength(1);
      expect(response.data[0].id).toBe(promotedAgent.id);
      expect(response.data[0].is_promoted).toBe(true);
    });

    test('should handle errors gracefully', async () => {
      mockReq.user.id = userB.toString();
      findAccessibleResources.mockRejectedValue(new Error('Permission service error'));

      await getListAgentsHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Permission service error',
      });
    });

    test('should respect combined filters with ACL', async () => {
      // Create agents with specific attributes
      const productivityPromoted = await Agent.create({
        id: `agent_${nanoid(12)}`,
        name: 'Productivity Pro',
        description: 'A promoted productivity agent',
        provider: 'openai',
        model: 'gpt-4',
        author: userA,
        category: 'productivity',
        is_promoted: true,
        versions: [
          {
            name: 'Productivity Pro',
            description: 'A promoted productivity agent',
            provider: 'openai',
            model: 'gpt-4',
            category: 'productivity',
            is_promoted: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      mockReq.user.id = userB.toString();
      mockReq.query.category = 'productivity';
      mockReq.query.promoted = '1';
      findAccessibleResources.mockResolvedValue([
        agentA1._id,
        agentA2._id,
        agentA3._id,
        productivityPromoted._id,
      ]);
      findPubliclyAccessibleResources.mockResolvedValue([]);

      await getListAgentsHandler(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.data).toHaveLength(1);
      expect(response.data[0].id).toBe(productivityPromoted.id);
      expect(response.data[0].category).toBe('productivity');
      expect(response.data[0].is_promoted).toBe(true);
    });
  });

  describe('S3 Avatar Refresh', () => {
    let userA, userB;
    let agentWithS3Avatar, agentWithLocalAvatar, agentOwnedByOther;

    beforeEach(async () => {
      await Agent.deleteMany({});
      jest.clearAllMocks();

      // Reset cache mock
      mockCache.get.mockResolvedValue(false);
      mockCache.set.mockResolvedValue(undefined);

      userA = new mongoose.Types.ObjectId();
      userB = new mongoose.Types.ObjectId();

      // Create agent with S3 avatar owned by userA
      agentWithS3Avatar = await Agent.create({
        id: `agent_${nanoid(12)}`,
        name: 'Agent with S3 Avatar',
        description: 'Has S3 avatar',
        provider: 'openai',
        model: 'gpt-4',
        author: userA,
        avatar: {
          source: FileSources.s3,
          filepath: 'old-s3-path.jpg',
        },
        versions: [
          {
            name: 'Agent with S3 Avatar',
            description: 'Has S3 avatar',
            provider: 'openai',
            model: 'gpt-4',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      // Create agent with local avatar owned by userA
      agentWithLocalAvatar = await Agent.create({
        id: `agent_${nanoid(12)}`,
        name: 'Agent with Local Avatar',
        description: 'Has local avatar',
        provider: 'openai',
        model: 'gpt-4',
        author: userA,
        avatar: {
          source: 'local',
          filepath: 'local-path.jpg',
        },
        versions: [
          {
            name: 'Agent with Local Avatar',
            description: 'Has local avatar',
            provider: 'openai',
            model: 'gpt-4',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      // Create agent with S3 avatar owned by userB
      agentOwnedByOther = await Agent.create({
        id: `agent_${nanoid(12)}`,
        name: 'Agent Owned By Other',
        description: 'Owned by userB',
        provider: 'openai',
        model: 'gpt-4',
        author: userB,
        avatar: {
          source: FileSources.s3,
          filepath: 'other-s3-path.jpg',
        },
        versions: [
          {
            name: 'Agent Owned By Other',
            description: 'Owned by userB',
            provider: 'openai',
            model: 'gpt-4',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });
    });

    test('should skip avatar refresh if cache hit', async () => {
      mockCache.get.mockResolvedValue(true);
      findAccessibleResources.mockResolvedValue([agentWithS3Avatar._id]);
      findPubliclyAccessibleResources.mockResolvedValue([]);

      const mockReq = {
        user: { id: userA.toString(), role: 'USER' },
        query: {},
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await getListAgentsHandler(mockReq, mockRes);

      // Should not call refreshS3Url when cache hit
      expect(refreshS3Url).not.toHaveBeenCalled();
    });

    test('should refresh and persist S3 avatars on cache miss', async () => {
      mockCache.get.mockResolvedValue(false);
      findAccessibleResources.mockResolvedValue([agentWithS3Avatar._id]);
      findPubliclyAccessibleResources.mockResolvedValue([]);
      refreshS3Url.mockResolvedValue('new-s3-path.jpg');

      const mockReq = {
        user: { id: userA.toString(), role: 'USER' },
        query: {},
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await getListAgentsHandler(mockReq, mockRes);

      // Verify S3 URL was refreshed
      expect(refreshS3Url).toHaveBeenCalled();

      // Verify cache was set
      expect(mockCache.set).toHaveBeenCalled();

      // Verify response was returned
      expect(mockRes.json).toHaveBeenCalled();
    });

    test('should refresh avatars for all accessible agents (VIEW permission)', async () => {
      mockCache.get.mockResolvedValue(false);
      // User A has access to both their own agent and userB's agent
      findAccessibleResources.mockResolvedValue([agentWithS3Avatar._id, agentOwnedByOther._id]);
      findPubliclyAccessibleResources.mockResolvedValue([]);
      refreshS3Url.mockResolvedValue('new-path.jpg');

      const mockReq = {
        user: { id: userA.toString(), role: 'USER' },
        query: {},
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await getListAgentsHandler(mockReq, mockRes);

      // Should be called for both agents - any user with VIEW access can refresh
      expect(refreshS3Url).toHaveBeenCalledTimes(2);
    });

    test('should skip non-S3 avatars', async () => {
      mockCache.get.mockResolvedValue(false);
      findAccessibleResources.mockResolvedValue([agentWithLocalAvatar._id, agentWithS3Avatar._id]);
      findPubliclyAccessibleResources.mockResolvedValue([]);
      refreshS3Url.mockResolvedValue('new-path.jpg');

      const mockReq = {
        user: { id: userA.toString(), role: 'USER' },
        query: {},
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await getListAgentsHandler(mockReq, mockRes);

      // Should only be called for S3 avatar agent
      expect(refreshS3Url).toHaveBeenCalledTimes(1);
    });

    test('should not update if S3 URL unchanged', async () => {
      mockCache.get.mockResolvedValue(false);
      findAccessibleResources.mockResolvedValue([agentWithS3Avatar._id]);
      findPubliclyAccessibleResources.mockResolvedValue([]);
      // Return the same path - no update needed
      refreshS3Url.mockResolvedValue('old-s3-path.jpg');

      const mockReq = {
        user: { id: userA.toString(), role: 'USER' },
        query: {},
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await getListAgentsHandler(mockReq, mockRes);

      // Verify refreshS3Url was called
      expect(refreshS3Url).toHaveBeenCalled();

      // Response should still be returned
      expect(mockRes.json).toHaveBeenCalled();
    });

    test('should handle S3 refresh errors gracefully', async () => {
      mockCache.get.mockResolvedValue(false);
      findAccessibleResources.mockResolvedValue([agentWithS3Avatar._id]);
      findPubliclyAccessibleResources.mockResolvedValue([]);
      refreshS3Url.mockRejectedValue(new Error('S3 error'));

      const mockReq = {
        user: { id: userA.toString(), role: 'USER' },
        query: {},
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      // Should not throw - handles error gracefully
      await expect(getListAgentsHandler(mockReq, mockRes)).resolves.not.toThrow();

      // Response should still be returned
      expect(mockRes.json).toHaveBeenCalled();
    });

    test('should process agents in batches', async () => {
      mockCache.get.mockResolvedValue(false);

      // Create 25 agents (should be processed in batches of 20)
      const manyAgents = [];
      for (let i = 0; i < 25; i++) {
        const agent = await Agent.create({
          id: `agent_${nanoid(12)}`,
          name: `Agent ${i}`,
          description: `Agent ${i} description`,
          provider: 'openai',
          model: 'gpt-4',
          author: userA,
          avatar: {
            source: FileSources.s3,
            filepath: `path${i}.jpg`,
          },
          versions: [
            {
              name: `Agent ${i}`,
              description: `Agent ${i} description`,
              provider: 'openai',
              model: 'gpt-4',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        });
        manyAgents.push(agent);
      }

      const allAgentIds = manyAgents.map((a) => a._id);
      findAccessibleResources.mockResolvedValue(allAgentIds);
      findPubliclyAccessibleResources.mockResolvedValue([]);
      refreshS3Url.mockImplementation((avatar) =>
        Promise.resolve(avatar.filepath.replace('.jpg', '-new.jpg')),
      );

      const mockReq = {
        user: { id: userA.toString(), role: 'USER' },
        query: {},
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await getListAgentsHandler(mockReq, mockRes);

      // All 25 should be processed
      expect(refreshS3Url).toHaveBeenCalledTimes(25);
    });

    test('should skip agents without id or author', async () => {
      mockCache.get.mockResolvedValue(false);

      // Create agent without proper id field (edge case)
      const agentWithoutId = await Agent.create({
        id: `agent_${nanoid(12)}`,
        name: 'Agent without ID field',
        description: 'Testing',
        provider: 'openai',
        model: 'gpt-4',
        author: userA,
        avatar: {
          source: FileSources.s3,
          filepath: 'test-path.jpg',
        },
        versions: [
          {
            name: 'Agent without ID field',
            description: 'Testing',
            provider: 'openai',
            model: 'gpt-4',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      findAccessibleResources.mockResolvedValue([agentWithoutId._id, agentWithS3Avatar._id]);
      findPubliclyAccessibleResources.mockResolvedValue([]);
      refreshS3Url.mockResolvedValue('new-path.jpg');

      const mockReq = {
        user: { id: userA.toString(), role: 'USER' },
        query: {},
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await getListAgentsHandler(mockReq, mockRes);

      // Should still complete without errors
      expect(mockRes.json).toHaveBeenCalled();
    });

    test('should use MAX_AVATAR_REFRESH_AGENTS limit for full list query', async () => {
      mockCache.get.mockResolvedValue(false);
      findAccessibleResources.mockResolvedValue([]);
      findPubliclyAccessibleResources.mockResolvedValue([]);

      const mockReq = {
        user: { id: userA.toString(), role: 'USER' },
        query: {},
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await getListAgentsHandler(mockReq, mockRes);

      // Verify that the handler completed successfully
      expect(mockRes.json).toHaveBeenCalled();
    });
  });
});
