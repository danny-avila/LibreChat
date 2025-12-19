const mongoose = require('mongoose');
const { ResourceType, PrincipalType, PrincipalModel } = require('librechat-data-provider');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { fileAccess } = require('./fileAccess');
const { User, Role, AclEntry } = require('~/db/models');
const { createAgent } = require('~/models/Agent');
const { createFile } = require('~/models');

describe('fileAccess middleware', () => {
  let mongoServer;
  let req, res, next;
  let testUser, otherUser, thirdUser;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();

    // Create test role
    await Role.create({
      name: 'test-role',
      permissions: {
        AGENTS: {
          USE: true,
          CREATE: true,
          SHARED_GLOBAL: false,
        },
      },
    });

    // Create test users
    testUser = await User.create({
      email: 'test@example.com',
      name: 'Test User',
      username: 'testuser',
      role: 'test-role',
    });

    otherUser = await User.create({
      email: 'other@example.com',
      name: 'Other User',
      username: 'otheruser',
      role: 'test-role',
    });

    thirdUser = await User.create({
      email: 'third@example.com',
      name: 'Third User',
      username: 'thirduser',
      role: 'test-role',
    });

    // Setup request/response objects
    req = {
      user: { id: testUser._id.toString(), role: testUser.role },
      params: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();

    jest.clearAllMocks();
  });

  describe('basic file access', () => {
    test('should allow access when user owns the file', async () => {
      // Create a file owned by testUser
      await createFile({
        user: testUser._id.toString(),
        file_id: 'file_owned_by_user',
        filepath: '/test/file.txt',
        filename: 'file.txt',
        type: 'text/plain',
        size: 100,
      });

      req.params.file_id = 'file_owned_by_user';
      await fileAccess(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.fileAccess).toBeDefined();
      expect(req.fileAccess.file).toBeDefined();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should deny access when user does not own the file and no agent access', async () => {
      // Create a file owned by otherUser
      await createFile({
        user: otherUser._id.toString(),
        file_id: 'file_owned_by_other',
        filepath: '/test/file.txt',
        filename: 'file.txt',
        type: 'text/plain',
        size: 100,
      });

      req.params.file_id = 'file_owned_by_other';
      await fileAccess(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Insufficient permissions to access this file',
      });
    });

    test('should return 404 when file does not exist', async () => {
      req.params.file_id = 'non_existent_file';
      await fileAccess(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'File not found',
      });
    });

    test('should return 400 when file_id is missing', async () => {
      // Don't set file_id in params
      await fileAccess(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'file_id is required',
      });
    });

    test('should return 401 when user is not authenticated', async () => {
      req.user = null;
      req.params.file_id = 'some_file';

      await fileAccess(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    });
  });

  describe('agent-based file access', () => {
    beforeEach(async () => {
      // Create a file owned by otherUser (not testUser)
      await createFile({
        user: otherUser._id.toString(),
        file_id: 'shared_file_via_agent',
        filepath: '/test/shared.txt',
        filename: 'shared.txt',
        type: 'text/plain',
        size: 100,
      });
    });

    test('should allow access when user is author of agent with file', async () => {
      // Create agent owned by testUser with the file
      await createAgent({
        id: `agent_${Date.now()}`,
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: testUser._id,
        tool_resources: {
          file_search: {
            file_ids: ['shared_file_via_agent'],
          },
        },
      });

      req.params.file_id = 'shared_file_via_agent';
      await fileAccess(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.fileAccess).toBeDefined();
      expect(req.fileAccess.file).toBeDefined();
    });

    test('should allow access when user has VIEW permission on agent with file', async () => {
      // Create agent owned by otherUser
      const agent = await createAgent({
        id: `agent_${Date.now()}`,
        name: 'Shared Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: otherUser._id,
        tool_resources: {
          execute_code: {
            file_ids: ['shared_file_via_agent'],
          },
        },
      });

      // Grant VIEW permission to testUser
      await AclEntry.create({
        principalType: PrincipalType.USER,
        principalId: testUser._id,
        principalModel: PrincipalModel.USER,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        permBits: 1, // VIEW permission
        grantedBy: otherUser._id,
      });

      req.params.file_id = 'shared_file_via_agent';
      await fileAccess(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.fileAccess).toBeDefined();
    });

    test('should check file in ocr tool_resources', async () => {
      await createAgent({
        id: `agent_ocr_${Date.now()}`,
        name: 'OCR Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: testUser._id,
        tool_resources: {
          ocr: {
            file_ids: ['shared_file_via_agent'],
          },
        },
      });

      req.params.file_id = 'shared_file_via_agent';
      await fileAccess(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.fileAccess).toBeDefined();
    });

    test('should deny access when user has no permission on agent with file', async () => {
      // Create agent owned by otherUser without granting permission to testUser
      const agent = await createAgent({
        id: `agent_${Date.now()}`,
        name: 'Private Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: otherUser._id,
        tool_resources: {
          file_search: {
            file_ids: ['shared_file_via_agent'],
          },
        },
      });

      // Create ACL entry for otherUser only (owner)
      await AclEntry.create({
        principalType: PrincipalType.USER,
        principalId: otherUser._id,
        principalModel: PrincipalModel.USER,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        permBits: 15, // All permissions
        grantedBy: otherUser._id,
      });

      req.params.file_id = 'shared_file_via_agent';
      await fileAccess(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('multiple agents with same file', () => {
    /**
     * This test suite verifies that when multiple agents have the same file,
     * all agents are checked for permissions, not just the first one found.
     * This ensures users can access files through any agent they have permission for.
     */

    test('should check ALL agents with file, not just first one', async () => {
      // Create a file owned by someone else
      await createFile({
        user: otherUser._id.toString(),
        file_id: 'multi_agent_file',
        filepath: '/test/multi.txt',
        filename: 'multi.txt',
        type: 'text/plain',
        size: 100,
      });

      // Create first agent (owned by otherUser, no access for testUser)
      const agent1 = await createAgent({
        id: 'agent_no_access',
        name: 'No Access Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: otherUser._id,
        tool_resources: {
          file_search: {
            file_ids: ['multi_agent_file'],
          },
        },
      });

      // Create ACL for agent1 - only otherUser has access
      await AclEntry.create({
        principalType: PrincipalType.USER,
        principalId: otherUser._id,
        principalModel: PrincipalModel.USER,
        resourceType: ResourceType.AGENT,
        resourceId: agent1._id,
        permBits: 15,
        grantedBy: otherUser._id,
      });

      // Create second agent (owned by thirdUser, but testUser has VIEW access)
      const agent2 = await createAgent({
        id: 'agent_with_access',
        name: 'Accessible Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: thirdUser._id,
        tool_resources: {
          file_search: {
            file_ids: ['multi_agent_file'],
          },
        },
      });

      // Grant testUser VIEW access to agent2
      await AclEntry.create({
        principalType: PrincipalType.USER,
        principalId: testUser._id,
        principalModel: PrincipalModel.USER,
        resourceType: ResourceType.AGENT,
        resourceId: agent2._id,
        permBits: 1, // VIEW permission
        grantedBy: thirdUser._id,
      });

      req.params.file_id = 'multi_agent_file';
      await fileAccess(req, res, next);

      /**
       * Should succeed because testUser has access to agent2,
       * even though they don't have access to agent1.
       * The fix ensures all agents are checked, not just the first one.
       */
      expect(next).toHaveBeenCalled();
      expect(req.fileAccess).toBeDefined();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should find file in any agent tool_resources type', async () => {
      // Create a file
      await createFile({
        user: otherUser._id.toString(),
        file_id: 'multi_tool_file',
        filepath: '/test/tool.txt',
        filename: 'tool.txt',
        type: 'text/plain',
        size: 100,
      });

      // Agent 1: file in file_search (no access for testUser)
      await createAgent({
        id: 'agent_file_search',
        name: 'File Search Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: otherUser._id,
        tool_resources: {
          file_search: {
            file_ids: ['multi_tool_file'],
          },
        },
      });

      // Agent 2: same file in execute_code (testUser has access)
      await createAgent({
        id: 'agent_execute_code',
        name: 'Execute Code Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: thirdUser._id,
        tool_resources: {
          execute_code: {
            file_ids: ['multi_tool_file'],
          },
        },
      });

      // Agent 3: same file in ocr (testUser also has access)
      await createAgent({
        id: 'agent_ocr',
        name: 'OCR Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: testUser._id, // testUser owns this one
        tool_resources: {
          ocr: {
            file_ids: ['multi_tool_file'],
          },
        },
      });

      req.params.file_id = 'multi_tool_file';
      await fileAccess(req, res, next);

      /**
       * Should succeed because testUser owns agent3,
       * even if other agents with the file are found first.
       */
      expect(next).toHaveBeenCalled();
      expect(req.fileAccess).toBeDefined();
    });
  });

  describe('edge cases', () => {
    test('should handle agent with empty tool_resources', async () => {
      await createFile({
        user: otherUser._id.toString(),
        file_id: 'orphan_file',
        filepath: '/test/orphan.txt',
        filename: 'orphan.txt',
        type: 'text/plain',
        size: 100,
      });

      // Create agent with no files in tool_resources
      await createAgent({
        id: `agent_empty_${Date.now()}`,
        name: 'Empty Resources Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: testUser._id,
        tool_resources: {},
      });

      req.params.file_id = 'orphan_file';
      await fileAccess(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('should handle agent with null tool_resources', async () => {
      await createFile({
        user: otherUser._id.toString(),
        file_id: 'another_orphan_file',
        filepath: '/test/orphan2.txt',
        filename: 'orphan2.txt',
        type: 'text/plain',
        size: 100,
      });

      // Create agent with null tool_resources
      await createAgent({
        id: `agent_null_${Date.now()}`,
        name: 'Null Resources Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: testUser._id,
        tool_resources: null,
      });

      req.params.file_id = 'another_orphan_file';
      await fileAccess(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
