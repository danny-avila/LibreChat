const request = require('supertest');
const express = require('express');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');
const { SystemRoles } = require('librechat-data-provider');
const { PermissionBits } = require('@librechat/data-schemas');

// Mock modules before importing
jest.mock('~/server/services/Config', () => ({
  getCachedTools: jest.fn().mockResolvedValue({}),
  getCustomConfig: jest.fn(),
}));

jest.mock('~/models/Role', () => ({
  getRoleByName: jest.fn(),
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => next(),
  canAccessPromptResource: jest.requireActual('~/server/middleware').canAccessPromptResource,
}));

let app;
let mongoServer;
let promptRoutes;
let Prompt, PromptGroup, AclEntry, AccessRole, User;
let testUsers, testRoles;
let grantPermission;

// Helper function to set user in middleware
function setTestUser(app, user) {
  app.use((req, res, next) => {
    req.user = {
      ...(user.toObject ? user.toObject() : user),
      id: user.id || user._id.toString(),
      _id: user._id,
      name: user.name,
      role: user.role,
    };
    if (user.role === SystemRoles.ADMIN) {
      console.log('Setting admin user with role:', req.user.role);
    }
    next();
  });
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  // Initialize models
  const dbModels = require('~/db/models');
  Prompt = dbModels.Prompt;
  PromptGroup = dbModels.PromptGroup;
  AclEntry = dbModels.AclEntry;
  AccessRole = dbModels.AccessRole;
  User = dbModels.User;

  // Import permission service
  const permissionService = require('~/server/services/PermissionService');
  grantPermission = permissionService.grantPermission;

  // Create test data
  await setupTestData();

  // Setup Express app
  app = express();
  app.use(express.json());

  // Mock authentication middleware - default to owner
  setTestUser(app, testUsers.owner);

  // Import routes after mocks are set up
  promptRoutes = require('./prompts');
  app.use('/api/prompts', promptRoutes);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  jest.clearAllMocks();
});

async function setupTestData() {
  // Create access roles
  testRoles = {
    viewer: await AccessRole.create({
      accessRoleId: 'prompt_viewer',
      name: 'Viewer',
      resourceType: 'prompt',
      permBits: PermissionBits.VIEW,
    }),
    editor: await AccessRole.create({
      accessRoleId: 'prompt_editor',
      name: 'Editor',
      resourceType: 'prompt',
      permBits: PermissionBits.VIEW | PermissionBits.EDIT,
    }),
    owner: await AccessRole.create({
      accessRoleId: 'prompt_owner',
      name: 'Owner',
      resourceType: 'prompt',
      permBits:
        PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.DELETE | PermissionBits.SHARE,
    }),
  };

  // Create test users
  testUsers = {
    owner: await User.create({
      id: new ObjectId().toString(),
      _id: new ObjectId(),
      name: 'Prompt Owner',
      email: 'owner@example.com',
      role: SystemRoles.USER,
    }),
    viewer: await User.create({
      id: new ObjectId().toString(),
      _id: new ObjectId(),
      name: 'Prompt Viewer',
      email: 'viewer@example.com',
      role: SystemRoles.USER,
    }),
    editor: await User.create({
      id: new ObjectId().toString(),
      _id: new ObjectId(),
      name: 'Prompt Editor',
      email: 'editor@example.com',
      role: SystemRoles.USER,
    }),
    noAccess: await User.create({
      id: new ObjectId().toString(),
      _id: new ObjectId(),
      name: 'No Access',
      email: 'noaccess@example.com',
      role: SystemRoles.USER,
    }),
    admin: await User.create({
      id: new ObjectId().toString(),
      _id: new ObjectId(),
      name: 'Admin',
      email: 'admin@example.com',
      role: SystemRoles.ADMIN,
    }),
  };

  // Mock getRoleByName
  const { getRoleByName } = require('~/models/Role');
  getRoleByName.mockImplementation((roleName) => {
    switch (roleName) {
      case SystemRoles.USER:
        return { permissions: { PROMPTS: { USE: true, CREATE: true } } };
      case SystemRoles.ADMIN:
        return { permissions: { PROMPTS: { USE: true, CREATE: true, SHARED_GLOBAL: true } } };
      default:
        return null;
    }
  });
}

describe('Prompt Routes - ACL Permissions', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  // Simple test to verify route is loaded
  it('should have routes loaded', async () => {
    // This should at least not crash
    const response = await request(app).get('/api/prompts/test-404');
    console.log('Test 404 response status:', response.status);
    console.log('Test 404 response body:', response.body);
    // We expect a 401 or 404, not 500
    expect(response.status).not.toBe(500);
  });

  describe('POST /api/prompts - Create Prompt', () => {
    afterEach(async () => {
      await Prompt.deleteMany({});
      await PromptGroup.deleteMany({});
      await AclEntry.deleteMany({});
    });

    it('should create a prompt and grant owner permissions', async () => {
      // First create a group to associate with the prompt
      const testGroup = await PromptGroup.create({
        name: 'Test Group for POST',
        category: 'testing',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: new ObjectId(),
      });

      const promptData = {
        prompt: {
          prompt: 'Test prompt content',
          name: 'Test Prompt',
          type: 'text',
          groupId: testGroup._id,
        },
      };

      const response = await request(app).post('/api/prompts').send(promptData);

      if (response.status !== 200) {
        console.log('POST /api/prompts error status:', response.status);
        console.log('POST /api/prompts error body:', response.body);
        console.log('Console errors:', consoleErrorSpy.mock.calls);
      }

      console.log('POST response:', response.body);

      expect(response.status).toBe(200);
      expect(response.body.prompt).toBeDefined();
      expect(response.body.prompt.prompt).toBe(promptData.prompt.prompt);

      // Check ACL entry was created
      const aclEntry = await AclEntry.findOne({
        resourceType: 'prompt',
        resourceId: response.body.prompt._id,
        principalType: 'user',
        principalId: testUsers.owner._id,
      });

      expect(aclEntry).toBeTruthy();
      expect(aclEntry.roleId.toString()).toBe(testRoles.owner._id.toString());
    });

    it('should create a prompt group with prompt and grant owner permissions', async () => {
      const promptData = {
        prompt: {
          prompt: 'Group prompt content',
          // Remove 'name' from prompt - it's not in the schema
        },
        group: {
          name: 'Test Group',
          category: 'testing',
        },
      };

      const response = await request(app).post('/api/prompts').send(promptData).expect(200);

      expect(response.body.prompt).toBeDefined();
      expect(response.body.group).toBeDefined();
      expect(response.body.group.name).toBe(promptData.group.name);

      // Check ACL entry was created for the prompt
      const aclEntry = await AclEntry.findOne({
        resourceType: 'prompt',
        resourceId: response.body.prompt._id,
        principalType: 'user',
        principalId: testUsers.owner._id,
      });

      expect(aclEntry).toBeTruthy();
    });
  });

  describe('GET /api/prompts/:promptId - Get Prompt', () => {
    let testPrompt;
    let testGroup;

    beforeEach(async () => {
      // Create a prompt group first
      testGroup = await PromptGroup.create({
        name: 'Test Group',
        category: 'testing',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: new ObjectId(),
      });

      // Create a prompt
      testPrompt = await Prompt.create({
        prompt: 'Test prompt for retrieval',
        name: 'Get Test',
        author: testUsers.owner._id,
        type: 'text',
        groupId: testGroup._id,
      });
    });

    afterEach(async () => {
      await Prompt.deleteMany({});
      await PromptGroup.deleteMany({});
      await AclEntry.deleteMany({});
    });

    it('should retrieve prompt when user has view permissions', async () => {
      // Grant view permissions
      await grantPermission({
        principalType: 'user',
        principalId: testUsers.owner._id,
        resourceType: 'prompt',
        resourceId: testPrompt._id,
        accessRoleId: 'prompt_viewer',
        grantedBy: testUsers.owner._id,
      });

      const response = await request(app).get(`/api/prompts/${testPrompt._id}`).expect(200);

      expect(response.body._id).toBe(testPrompt._id.toString());
      expect(response.body.prompt).toBe(testPrompt.prompt);
    });

    it('should deny access when user has no permissions', async () => {
      // Change the user to one without access
      setTestUser(app, testUsers.noAccess);

      const response = await request(app).get(`/api/prompts/${testPrompt._id}`).expect(403);

      // Verify error response
      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toBe('Insufficient permissions to access this prompt');
    });

    it('should allow admin access without explicit permissions', async () => {
      // First, reset the app to remove previous middleware
      app = express();
      app.use(express.json());

      // Set admin user BEFORE adding routes
      app.use((req, res, next) => {
        req.user = {
          ...testUsers.admin.toObject(),
          id: testUsers.admin._id.toString(),
          _id: testUsers.admin._id,
          name: testUsers.admin.name,
          role: testUsers.admin.role,
        };
        next();
      });

      // Now add the routes
      const promptRoutes = require('./prompts');
      app.use('/api/prompts', promptRoutes);

      console.log('Admin user:', testUsers.admin);
      console.log('Admin role:', testUsers.admin.role);
      console.log('SystemRoles.ADMIN:', SystemRoles.ADMIN);

      const response = await request(app).get(`/api/prompts/${testPrompt._id}`).expect(200);

      expect(response.body._id).toBe(testPrompt._id.toString());
    });
  });

  describe('DELETE /api/prompts/:promptId - Delete Prompt', () => {
    let testPrompt;
    let testGroup;

    beforeEach(async () => {
      // Create group with prompt
      testGroup = await PromptGroup.create({
        name: 'Delete Test Group',
        category: 'testing',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: new ObjectId(),
      });

      testPrompt = await Prompt.create({
        prompt: 'Test prompt for deletion',
        name: 'Delete Test',
        author: testUsers.owner._id,
        type: 'text',
        groupId: testGroup._id,
      });

      // Add prompt to group
      testGroup.productionId = testPrompt._id;
      testGroup.promptIds = [testPrompt._id];
      await testGroup.save();

      // Grant owner permissions
      await grantPermission({
        principalType: 'user',
        principalId: testUsers.owner._id,
        resourceType: 'prompt',
        resourceId: testPrompt._id,
        accessRoleId: 'prompt_owner',
        grantedBy: testUsers.owner._id,
      });
    });

    afterEach(async () => {
      await Prompt.deleteMany({});
      await PromptGroup.deleteMany({});
      await AclEntry.deleteMany({});
    });

    it('should delete prompt when user has delete permissions', async () => {
      const response = await request(app)
        .delete(`/api/prompts/${testPrompt._id}`)
        .query({ groupId: testGroup._id.toString() })
        .expect(200);

      expect(response.body.prompt).toBe('Prompt deleted successfully');

      // Verify prompt was deleted
      const deletedPrompt = await Prompt.findById(testPrompt._id);
      expect(deletedPrompt).toBeNull();

      // Verify ACL entries were removed
      const aclEntries = await AclEntry.find({
        resourceType: 'prompt',
        resourceId: testPrompt._id,
      });
      expect(aclEntries).toHaveLength(0);
    });

    it('should deny deletion when user lacks delete permissions', async () => {
      // Create a prompt as a different user (not the one trying to delete)
      const authorPrompt = await Prompt.create({
        prompt: 'Test prompt by another user',
        name: 'Another User Prompt',
        author: testUsers.editor._id, // Different author
        type: 'text',
        groupId: testGroup._id,
      });

      // Grant only viewer permissions to viewer user
      await grantPermission({
        principalType: 'user',
        principalId: testUsers.viewer._id,
        resourceType: 'prompt',
        resourceId: authorPrompt._id,
        accessRoleId: 'prompt_viewer',
        grantedBy: testUsers.editor._id,
      });

      // Recreate app with viewer user
      app = express();
      app.use(express.json());
      app.use((req, res, next) => {
        req.user = {
          ...testUsers.viewer.toObject(),
          id: testUsers.viewer._id.toString(),
          _id: testUsers.viewer._id,
          name: testUsers.viewer.name,
          role: testUsers.viewer.role,
        };
        next();
      });
      const promptRoutes = require('./prompts');
      app.use('/api/prompts', promptRoutes);

      await request(app)
        .delete(`/api/prompts/${authorPrompt._id}`)
        .query({ groupId: testGroup._id.toString() })
        .expect(403);

      // Verify prompt still exists
      const prompt = await Prompt.findById(authorPrompt._id);
      expect(prompt).toBeTruthy();
    });
  });

  describe('PATCH /api/prompts/:promptId/tags/production - Make Production', () => {
    let testPrompt;
    let testGroup;

    beforeEach(async () => {
      // Create group
      testGroup = await PromptGroup.create({
        name: 'Production Test Group',
        category: 'testing',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: new ObjectId(),
      });

      testPrompt = await Prompt.create({
        prompt: 'Test prompt for production',
        name: 'Production Test',
        author: testUsers.owner._id,
        type: 'text',
        groupId: testGroup._id,
      });
    });

    afterEach(async () => {
      await Prompt.deleteMany({});
      await PromptGroup.deleteMany({});
      await AclEntry.deleteMany({});
    });

    it('should make prompt production when user has edit permissions', async () => {
      // Grant edit permissions
      await grantPermission({
        principalType: 'user',
        principalId: testUsers.owner._id,
        resourceType: 'prompt',
        resourceId: testPrompt._id,
        accessRoleId: 'prompt_editor',
        grantedBy: testUsers.owner._id,
      });

      // Recreate app to ensure fresh middleware
      app = express();
      app.use(express.json());
      app.use((req, res, next) => {
        req.user = {
          ...testUsers.owner.toObject(),
          id: testUsers.owner._id.toString(),
          _id: testUsers.owner._id,
          name: testUsers.owner.name,
          role: testUsers.owner.role,
        };
        next();
      });
      const promptRoutes = require('./prompts');
      app.use('/api/prompts', promptRoutes);

      const response = await request(app)
        .patch(`/api/prompts/${testPrompt._id}/tags/production`)
        .expect(200);

      expect(response.body.message).toBe('Prompt production made successfully');

      // Verify the group was updated
      const updatedGroup = await PromptGroup.findById(testGroup._id);
      expect(updatedGroup.productionId.toString()).toBe(testPrompt._id.toString());
    });

    it('should deny making production when user lacks edit permissions', async () => {
      // Grant only view permissions to viewer
      await grantPermission({
        principalType: 'user',
        principalId: testUsers.viewer._id,
        resourceType: 'prompt',
        resourceId: testPrompt._id,
        accessRoleId: 'prompt_viewer',
        grantedBy: testUsers.owner._id,
      });

      // Recreate app with viewer user
      app = express();
      app.use(express.json());
      app.use((req, res, next) => {
        req.user = {
          ...testUsers.viewer.toObject(),
          id: testUsers.viewer._id.toString(),
          _id: testUsers.viewer._id,
          name: testUsers.viewer.name,
          role: testUsers.viewer.role,
        };
        next();
      });
      const promptRoutes = require('./prompts');
      app.use('/api/prompts', promptRoutes);

      await request(app).patch(`/api/prompts/${testPrompt._id}/tags/production`).expect(403);

      // Verify prompt hasn't changed
      const unchangedGroup = await PromptGroup.findById(testGroup._id);
      expect(unchangedGroup.productionId.toString()).not.toBe(testPrompt._id.toString());
    });
  });

  describe('Public Access', () => {
    let publicPrompt;
    let publicGroup;

    beforeEach(async () => {
      // Create a prompt group
      publicGroup = await PromptGroup.create({
        name: 'Public Test Group',
        category: 'testing',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: new ObjectId(),
      });

      // Create a public prompt
      publicPrompt = await Prompt.create({
        prompt: 'Public prompt content',
        name: 'Public Test',
        author: testUsers.owner._id,
        type: 'text',
        groupId: publicGroup._id,
      });

      // Grant public viewer access
      await grantPermission({
        principalType: 'public',
        principalId: null,
        resourceType: 'prompt',
        resourceId: publicPrompt._id,
        accessRoleId: 'prompt_viewer',
        grantedBy: testUsers.owner._id,
      });
    });

    afterEach(async () => {
      await Prompt.deleteMany({});
      await PromptGroup.deleteMany({});
      await AclEntry.deleteMany({});
    });

    it('should allow any user to view public prompts', async () => {
      // Change user to someone without explicit permissions
      setTestUser(app, testUsers.noAccess);

      const response = await request(app).get(`/api/prompts/${publicPrompt._id}`).expect(200);

      expect(response.body._id).toBe(publicPrompt._id.toString());
    });
  });
});
