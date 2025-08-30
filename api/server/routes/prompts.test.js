const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  SystemRoles,
  ResourceType,
  AccessRoleIds,
  PrincipalType,
  PermissionBits,
} = require('librechat-data-provider');

// Mock modules before importing
jest.mock('~/server/services/Config', () => ({
  getCachedTools: jest.fn().mockResolvedValue({}),
}));

jest.mock('~/models/Role', () => ({
  getRoleByName: jest.fn(),
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => next(),
  canAccessPromptViaGroup: jest.requireActual('~/server/middleware').canAccessPromptViaGroup,
  canAccessPromptGroupResource:
    jest.requireActual('~/server/middleware').canAccessPromptGroupResource,
}));

let app;
let mongoServer;
let promptRoutes;
let Prompt, PromptGroup, AclEntry, AccessRole, User;
let testUsers, testRoles;
let grantPermission;
let currentTestUser; // Track current user for middleware

// Helper function to set user in middleware
function setTestUser(app, user) {
  currentTestUser = user;
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

  // Add user middleware before routes
  app.use((req, res, next) => {
    if (currentTestUser) {
      req.user = {
        ...(currentTestUser.toObject ? currentTestUser.toObject() : currentTestUser),
        id: currentTestUser._id.toString(),
        _id: currentTestUser._id,
        name: currentTestUser.name,
        role: currentTestUser.role,
      };
    }
    next();
  });

  // Set default user
  currentTestUser = testUsers.owner;

  // Import routes after middleware is set up
  promptRoutes = require('./prompts');
  app.use('/api/prompts', promptRoutes);
});

afterEach(() => {
  // Always reset to owner user after each test for isolation
  if (currentTestUser !== testUsers.owner) {
    currentTestUser = testUsers.owner;
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  jest.clearAllMocks();
});

async function setupTestData() {
  // Create access roles for promptGroups
  testRoles = {
    viewer: await AccessRole.create({
      accessRoleId: AccessRoleIds.PROMPTGROUP_VIEWER,
      name: 'Viewer',
      resourceType: ResourceType.PROMPTGROUP,
      permBits: PermissionBits.VIEW,
    }),
    editor: await AccessRole.create({
      accessRoleId: AccessRoleIds.PROMPTGROUP_EDITOR,
      name: 'Editor',
      resourceType: ResourceType.PROMPTGROUP,
      permBits: PermissionBits.VIEW | PermissionBits.EDIT,
    }),
    owner: await AccessRole.create({
      accessRoleId: AccessRoleIds.PROMPTGROUP_OWNER,
      name: 'Owner',
      resourceType: ResourceType.PROMPTGROUP,
      permBits:
        PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.DELETE | PermissionBits.SHARE,
    }),
  };

  // Create test users
  testUsers = {
    owner: await User.create({
      name: 'Prompt Owner',
      email: 'owner@example.com',
      role: SystemRoles.USER,
    }),
    viewer: await User.create({
      name: 'Prompt Viewer',
      email: 'viewer@example.com',
      role: SystemRoles.USER,
    }),
    editor: await User.create({
      name: 'Prompt Editor',
      email: 'editor@example.com',
      role: SystemRoles.USER,
    }),
    noAccess: await User.create({
      name: 'No Access',
      email: 'noaccess@example.com',
      role: SystemRoles.USER,
    }),
    admin: await User.create({
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
      const promptData = {
        prompt: {
          prompt: 'Test prompt content',
          type: 'text',
        },
        group: {
          name: 'Test Prompt Group',
        },
      };

      const response = await request(app).post('/api/prompts').send(promptData);

      expect(response.status).toBe(200);
      expect(response.body.prompt).toBeDefined();
      expect(response.body.prompt.prompt).toBe(promptData.prompt.prompt);

      // Check ACL entry was created
      const aclEntry = await AclEntry.findOne({
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: response.body.prompt.groupId,
        principalType: PrincipalType.USER,
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

      // Check ACL entry was created for the promptGroup
      const aclEntry = await AclEntry.findOne({
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: response.body.group._id,
        principalType: PrincipalType.USER,
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
      // Grant view permissions on the promptGroup
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: testUsers.owner._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testGroup._id,
        accessRoleId: AccessRoleIds.PROMPTGROUP_VIEWER,
        grantedBy: testUsers.owner._id,
      });

      const response = await request(app).get(`/api/prompts/${testPrompt._id}`);
      expect(response.status).toBe(200);
      expect(response.body._id).toBe(testPrompt._id.toString());
      expect(response.body.prompt).toBe(testPrompt.prompt);
    });

    it('should deny access when user has no permissions', async () => {
      // Change the user to one without access
      setTestUser(app, testUsers.noAccess);

      const response = await request(app).get(`/api/prompts/${testPrompt._id}`).expect(403);

      // Verify error response
      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toBe('Insufficient permissions to access this promptGroup');
    });

    it('should allow admin access without explicit permissions', async () => {
      // Set admin user
      setTestUser(app, testUsers.admin);

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

      // Grant owner permissions on the promptGroup
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: testUsers.owner._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testGroup._id,
        accessRoleId: AccessRoleIds.PROMPTGROUP_OWNER,
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
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testGroup._id,
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

      // Grant only viewer permissions to viewer user on the promptGroup
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: testUsers.viewer._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testGroup._id,
        accessRoleId: AccessRoleIds.PROMPTGROUP_VIEWER,
        grantedBy: testUsers.editor._id,
      });

      // Set viewer user
      setTestUser(app, testUsers.viewer);

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
      // Grant edit permissions on the promptGroup
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: testUsers.owner._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testGroup._id,
        accessRoleId: AccessRoleIds.PROMPTGROUP_EDITOR,
        grantedBy: testUsers.owner._id,
      });

      // Ensure owner user
      setTestUser(app, testUsers.owner);

      const response = await request(app)
        .patch(`/api/prompts/${testPrompt._id}/tags/production`)
        .expect(200);

      expect(response.body.message).toBe('Prompt production made successfully');

      // Verify the group was updated
      const updatedGroup = await PromptGroup.findById(testGroup._id);
      expect(updatedGroup.productionId.toString()).toBe(testPrompt._id.toString());
    });

    it('should deny making production when user lacks edit permissions', async () => {
      // Grant only view permissions to viewer on the promptGroup
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: testUsers.viewer._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testGroup._id,
        accessRoleId: AccessRoleIds.PROMPTGROUP_VIEWER,
        grantedBy: testUsers.owner._id,
      });

      // Set viewer user
      setTestUser(app, testUsers.viewer);

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

      // Grant public viewer access on the promptGroup
      await grantPermission({
        principalType: PrincipalType.PUBLIC,
        principalId: null,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: publicGroup._id,
        accessRoleId: AccessRoleIds.PROMPTGROUP_VIEWER,
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

  describe('Pagination', () => {
    beforeEach(async () => {
      // Create multiple prompt groups for pagination testing
      const groups = [];
      for (let i = 0; i < 15; i++) {
        const group = await PromptGroup.create({
          name: `Test Group ${i + 1}`,
          category: 'pagination-test',
          author: testUsers.owner._id,
          authorName: testUsers.owner.name,
          productionId: new ObjectId(),
          updatedAt: new Date(Date.now() - i * 1000), // Stagger updatedAt for consistent ordering
        });
        groups.push(group);

        // Grant owner permissions on each group
        await grantPermission({
          principalType: PrincipalType.USER,
          principalId: testUsers.owner._id,
          resourceType: ResourceType.PROMPTGROUP,
          resourceId: group._id,
          accessRoleId: AccessRoleIds.PROMPTGROUP_OWNER,
          grantedBy: testUsers.owner._id,
        });
      }
    });

    afterEach(async () => {
      await PromptGroup.deleteMany({});
      await AclEntry.deleteMany({});
    });

    it('should correctly indicate hasMore when there are more pages', async () => {
      const response = await request(app)
        .get('/api/prompts/groups')
        .query({ limit: '10' })
        .expect(200);

      expect(response.body.promptGroups).toHaveLength(10);
      expect(response.body.has_more).toBe(true);
      expect(response.body.after).toBeTruthy();
      // Since has_more is true, pages should be a high number (9999 in our fix)
      expect(parseInt(response.body.pages)).toBeGreaterThan(1);
    });

    it('should correctly indicate no more pages on the last page', async () => {
      // First get the cursor for page 2
      const firstPage = await request(app)
        .get('/api/prompts/groups')
        .query({ limit: '10' })
        .expect(200);

      expect(firstPage.body.has_more).toBe(true);
      expect(firstPage.body.after).toBeTruthy();

      // Now fetch the second page using the cursor
      const response = await request(app)
        .get('/api/prompts/groups')
        .query({ limit: '10', cursor: firstPage.body.after })
        .expect(200);

      expect(response.body.promptGroups).toHaveLength(5); // 15 total, 10 on page 1, 5 on page 2
      expect(response.body.has_more).toBe(false);
    });

    it('should support cursor-based pagination', async () => {
      // First page
      const firstPage = await request(app)
        .get('/api/prompts/groups')
        .query({ limit: '5' })
        .expect(200);

      expect(firstPage.body.promptGroups).toHaveLength(5);
      expect(firstPage.body.has_more).toBe(true);
      expect(firstPage.body.after).toBeTruthy();

      // Second page using cursor
      const secondPage = await request(app)
        .get('/api/prompts/groups')
        .query({ limit: '5', cursor: firstPage.body.after })
        .expect(200);

      expect(secondPage.body.promptGroups).toHaveLength(5);
      expect(secondPage.body.has_more).toBe(true);
      expect(secondPage.body.after).toBeTruthy();

      // Verify different groups
      const firstPageIds = firstPage.body.promptGroups.map((g) => g._id);
      const secondPageIds = secondPage.body.promptGroups.map((g) => g._id);
      expect(firstPageIds).not.toEqual(secondPageIds);
    });

    it('should paginate correctly with category filtering', async () => {
      // Create groups with different categories
      await PromptGroup.deleteMany({}); // Clear existing groups
      await AclEntry.deleteMany({});

      // Create 8 groups with category 'test-cat-1'
      for (let i = 0; i < 8; i++) {
        const group = await PromptGroup.create({
          name: `Category 1 Group ${i + 1}`,
          category: 'test-cat-1',
          author: testUsers.owner._id,
          authorName: testUsers.owner.name,
          productionId: new ObjectId(),
          updatedAt: new Date(Date.now() - i * 1000),
        });

        await grantPermission({
          principalType: PrincipalType.USER,
          principalId: testUsers.owner._id,
          resourceType: ResourceType.PROMPTGROUP,
          resourceId: group._id,
          accessRoleId: AccessRoleIds.PROMPTGROUP_OWNER,
          grantedBy: testUsers.owner._id,
        });
      }

      // Create 7 groups with category 'test-cat-2'
      for (let i = 0; i < 7; i++) {
        const group = await PromptGroup.create({
          name: `Category 2 Group ${i + 1}`,
          category: 'test-cat-2',
          author: testUsers.owner._id,
          authorName: testUsers.owner.name,
          productionId: new ObjectId(),
          updatedAt: new Date(Date.now() - (i + 8) * 1000),
        });

        await grantPermission({
          principalType: PrincipalType.USER,
          principalId: testUsers.owner._id,
          resourceType: ResourceType.PROMPTGROUP,
          resourceId: group._id,
          accessRoleId: AccessRoleIds.PROMPTGROUP_OWNER,
          grantedBy: testUsers.owner._id,
        });
      }

      // Test pagination with category filter
      const firstPage = await request(app)
        .get('/api/prompts/groups')
        .query({ limit: '5', category: 'test-cat-1' })
        .expect(200);

      expect(firstPage.body.promptGroups).toHaveLength(5);
      expect(firstPage.body.promptGroups.every((g) => g.category === 'test-cat-1')).toBe(true);
      expect(firstPage.body.has_more).toBe(true);
      expect(firstPage.body.after).toBeTruthy();

      const secondPage = await request(app)
        .get('/api/prompts/groups')
        .query({ limit: '5', cursor: firstPage.body.after, category: 'test-cat-1' })
        .expect(200);

      expect(secondPage.body.promptGroups).toHaveLength(3); // 8 total, 5 on page 1, 3 on page 2
      expect(secondPage.body.promptGroups.every((g) => g.category === 'test-cat-1')).toBe(true);
      expect(secondPage.body.has_more).toBe(false);
    });

    it('should paginate correctly with name/keyword filtering', async () => {
      // Create groups with specific names
      await PromptGroup.deleteMany({}); // Clear existing groups
      await AclEntry.deleteMany({});

      // Create 12 groups with 'Search' in the name
      for (let i = 0; i < 12; i++) {
        const group = await PromptGroup.create({
          name: `Search Test Group ${i + 1}`,
          category: 'search-test',
          author: testUsers.owner._id,
          authorName: testUsers.owner.name,
          productionId: new ObjectId(),
          updatedAt: new Date(Date.now() - i * 1000),
        });

        await grantPermission({
          principalType: PrincipalType.USER,
          principalId: testUsers.owner._id,
          resourceType: ResourceType.PROMPTGROUP,
          resourceId: group._id,
          accessRoleId: AccessRoleIds.PROMPTGROUP_OWNER,
          grantedBy: testUsers.owner._id,
        });
      }

      // Create 5 groups without 'Search' in the name
      for (let i = 0; i < 5; i++) {
        const group = await PromptGroup.create({
          name: `Other Group ${i + 1}`,
          category: 'other-test',
          author: testUsers.owner._id,
          authorName: testUsers.owner.name,
          productionId: new ObjectId(),
          updatedAt: new Date(Date.now() - (i + 12) * 1000),
        });

        await grantPermission({
          principalType: PrincipalType.USER,
          principalId: testUsers.owner._id,
          resourceType: ResourceType.PROMPTGROUP,
          resourceId: group._id,
          accessRoleId: AccessRoleIds.PROMPTGROUP_OWNER,
          grantedBy: testUsers.owner._id,
        });
      }

      // Test pagination with name filter
      const firstPage = await request(app)
        .get('/api/prompts/groups')
        .query({ limit: '10', name: 'Search' })
        .expect(200);

      expect(firstPage.body.promptGroups).toHaveLength(10);
      expect(firstPage.body.promptGroups.every((g) => g.name.includes('Search'))).toBe(true);
      expect(firstPage.body.has_more).toBe(true);
      expect(firstPage.body.after).toBeTruthy();

      const secondPage = await request(app)
        .get('/api/prompts/groups')
        .query({ limit: '10', cursor: firstPage.body.after, name: 'Search' })
        .expect(200);

      expect(secondPage.body.promptGroups).toHaveLength(2); // 12 total, 10 on page 1, 2 on page 2
      expect(secondPage.body.promptGroups.every((g) => g.name.includes('Search'))).toBe(true);
      expect(secondPage.body.has_more).toBe(false);
    });

    it('should paginate correctly with combined filters', async () => {
      // Create groups with various combinations
      await PromptGroup.deleteMany({}); // Clear existing groups
      await AclEntry.deleteMany({});

      // Create 6 groups matching both category and name filters
      for (let i = 0; i < 6; i++) {
        const group = await PromptGroup.create({
          name: `API Test Group ${i + 1}`,
          category: 'api-category',
          author: testUsers.owner._id,
          authorName: testUsers.owner.name,
          productionId: new ObjectId(),
          updatedAt: new Date(Date.now() - i * 1000),
        });

        await grantPermission({
          principalType: PrincipalType.USER,
          principalId: testUsers.owner._id,
          resourceType: ResourceType.PROMPTGROUP,
          resourceId: group._id,
          accessRoleId: AccessRoleIds.PROMPTGROUP_OWNER,
          grantedBy: testUsers.owner._id,
        });
      }

      // Create groups that only match one filter
      for (let i = 0; i < 4; i++) {
        const group = await PromptGroup.create({
          name: `API Other Group ${i + 1}`,
          category: 'other-category',
          author: testUsers.owner._id,
          authorName: testUsers.owner.name,
          productionId: new ObjectId(),
          updatedAt: new Date(Date.now() - (i + 6) * 1000),
        });

        await grantPermission({
          principalType: PrincipalType.USER,
          principalId: testUsers.owner._id,
          resourceType: ResourceType.PROMPTGROUP,
          resourceId: group._id,
          accessRoleId: AccessRoleIds.PROMPTGROUP_OWNER,
          grantedBy: testUsers.owner._id,
        });
      }

      // Test pagination with both filters
      const response = await request(app)
        .get('/api/prompts/groups')
        .query({ limit: '5', name: 'API', category: 'api-category' })
        .expect(200);

      expect(response.body.promptGroups).toHaveLength(5);
      expect(
        response.body.promptGroups.every(
          (g) => g.name.includes('API') && g.category === 'api-category',
        ),
      ).toBe(true);
      expect(response.body.has_more).toBe(true);
      expect(response.body.after).toBeTruthy();

      // Page 2
      const page2 = await request(app)
        .get('/api/prompts/groups')
        .query({ limit: '5', cursor: response.body.after, name: 'API', category: 'api-category' })
        .expect(200);

      expect(page2.body.promptGroups).toHaveLength(1); // 6 total, 5 on page 1, 1 on page 2
      expect(page2.body.has_more).toBe(false);
    });
  });
});
