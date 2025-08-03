const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');
const { logger } = require('@librechat/data-schemas');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  SystemRoles,
  ResourceType,
  AccessRoleIds,
  PrincipalType,
  PermissionBits,
} = require('librechat-data-provider');

// Mock the config/connect module to prevent connection attempts during tests
jest.mock('../../config/connect', () => jest.fn().mockResolvedValue(true));

const dbModels = require('~/db/models');

// Disable console for tests
logger.silent = true;

let mongoServer;
let Prompt, PromptGroup, AclEntry, AccessRole, User, Group, Project;
let promptFns, permissionService;
let testUsers, testGroups, testRoles;

beforeAll(async () => {
  // Set up MongoDB memory server
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  // Initialize models
  Prompt = dbModels.Prompt;
  PromptGroup = dbModels.PromptGroup;
  AclEntry = dbModels.AclEntry;
  AccessRole = dbModels.AccessRole;
  User = dbModels.User;
  Group = dbModels.Group;
  Project = dbModels.Project;

  promptFns = require('~/models/Prompt');
  permissionService = require('~/server/services/PermissionService');

  // Create test data
  await setupTestData();
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
      description: 'Can view promptGroups',
      resourceType: ResourceType.PROMPTGROUP,
      permBits: PermissionBits.VIEW,
    }),
    editor: await AccessRole.create({
      accessRoleId: AccessRoleIds.PROMPTGROUP_EDITOR,
      name: 'Editor',
      description: 'Can view and edit promptGroups',
      resourceType: ResourceType.PROMPTGROUP,
      permBits: PermissionBits.VIEW | PermissionBits.EDIT,
    }),
    owner: await AccessRole.create({
      accessRoleId: AccessRoleIds.PROMPTGROUP_OWNER,
      name: 'Owner',
      description: 'Full control over promptGroups',
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
    editor: await User.create({
      name: 'Prompt Editor',
      email: 'editor@example.com',
      role: SystemRoles.USER,
    }),
    viewer: await User.create({
      name: 'Prompt Viewer',
      email: 'viewer@example.com',
      role: SystemRoles.USER,
    }),
    admin: await User.create({
      name: 'Admin User',
      email: 'admin@example.com',
      role: SystemRoles.ADMIN,
    }),
    noAccess: await User.create({
      name: 'No Access User',
      email: 'noaccess@example.com',
      role: SystemRoles.USER,
    }),
  };

  // Create test groups
  testGroups = {
    editors: await Group.create({
      name: 'Prompt Editors',
      description: 'Group with editor access',
    }),
    viewers: await Group.create({
      name: 'Prompt Viewers',
      description: 'Group with viewer access',
    }),
  };

  await Project.create({
    name: 'Global',
    description: 'Global project',
    promptGroupIds: [],
  });
}

describe('Prompt ACL Permissions', () => {
  describe('Creating Prompts with Permissions', () => {
    it('should grant owner permissions when creating a prompt', async () => {
      // First create a group
      const testGroup = await PromptGroup.create({
        name: 'Test Group',
        category: 'testing',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: new mongoose.Types.ObjectId(),
      });

      const promptData = {
        prompt: {
          prompt: 'Test prompt content',
          name: 'Test Prompt',
          type: 'text',
          groupId: testGroup._id,
        },
        author: testUsers.owner._id,
      };

      await promptFns.savePrompt(promptData);

      // Manually grant permissions as would happen in the route
      await permissionService.grantPermission({
        principalType: PrincipalType.USER,
        principalId: testUsers.owner._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testGroup._id,
        accessRoleId: AccessRoleIds.PROMPTGROUP_OWNER,
        grantedBy: testUsers.owner._id,
      });

      // Check ACL entry
      const aclEntry = await AclEntry.findOne({
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testGroup._id,
        principalType: PrincipalType.USER,
        principalId: testUsers.owner._id,
      });

      expect(aclEntry).toBeTruthy();
      expect(aclEntry.permBits).toBe(testRoles.owner.permBits);
    });
  });

  describe('Accessing Prompts', () => {
    let testPromptGroup;

    beforeEach(async () => {
      // Create a prompt group
      testPromptGroup = await PromptGroup.create({
        name: 'Test Group',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: new ObjectId(),
      });

      // Create a prompt
      await Prompt.create({
        prompt: 'Test prompt for access control',
        name: 'Access Test Prompt',
        author: testUsers.owner._id,
        groupId: testPromptGroup._id,
        type: 'text',
      });

      // Grant owner permissions
      await permissionService.grantPermission({
        principalType: PrincipalType.USER,
        principalId: testUsers.owner._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testPromptGroup._id,
        accessRoleId: AccessRoleIds.PROMPTGROUP_OWNER,
        grantedBy: testUsers.owner._id,
      });
    });

    afterEach(async () => {
      await Prompt.deleteMany({});
      await PromptGroup.deleteMany({});
      await AclEntry.deleteMany({});
    });

    it('owner should have full access to their prompt', async () => {
      const hasAccess = await permissionService.checkPermission({
        userId: testUsers.owner._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testPromptGroup._id,
        requiredPermission: PermissionBits.VIEW,
      });

      expect(hasAccess).toBe(true);

      const canEdit = await permissionService.checkPermission({
        userId: testUsers.owner._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testPromptGroup._id,
        requiredPermission: PermissionBits.EDIT,
      });

      expect(canEdit).toBe(true);
    });

    it('user with viewer role should only have view access', async () => {
      // Grant viewer permissions
      await permissionService.grantPermission({
        principalType: PrincipalType.USER,
        principalId: testUsers.viewer._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testPromptGroup._id,
        accessRoleId: AccessRoleIds.PROMPTGROUP_VIEWER,
        grantedBy: testUsers.owner._id,
      });

      const canView = await permissionService.checkPermission({
        userId: testUsers.viewer._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testPromptGroup._id,
        requiredPermission: PermissionBits.VIEW,
      });

      const canEdit = await permissionService.checkPermission({
        userId: testUsers.viewer._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testPromptGroup._id,
        requiredPermission: PermissionBits.EDIT,
      });

      expect(canView).toBe(true);
      expect(canEdit).toBe(false);
    });

    it('user without permissions should have no access', async () => {
      const hasAccess = await permissionService.checkPermission({
        userId: testUsers.noAccess._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testPromptGroup._id,
        requiredPermission: PermissionBits.VIEW,
      });

      expect(hasAccess).toBe(false);
    });

    it('admin should have access regardless of permissions', async () => {
      // Admin users should work through normal permission system
      // The middleware layer handles admin bypass, not the permission service
      const hasAccess = await permissionService.checkPermission({
        userId: testUsers.admin._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testPromptGroup._id,
        requiredPermission: PermissionBits.VIEW,
      });

      // Without explicit permissions, even admin won't have access at this layer
      expect(hasAccess).toBe(false);

      // The actual admin bypass happens in the middleware layer (`canAccessPromptViaGroup`/`canAccessPromptGroupResource`)
      // which checks req.user.role === SystemRoles.ADMIN
    });
  });

  describe('Group-based Access', () => {
    let testPromptGroup;

    beforeEach(async () => {
      // Create a prompt group first
      testPromptGroup = await PromptGroup.create({
        name: 'Group Access Test Group',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: new ObjectId(),
      });

      await Prompt.create({
        prompt: 'Group access test prompt',
        name: 'Group Test',
        author: testUsers.owner._id,
        groupId: testPromptGroup._id,
        type: 'text',
      });

      // Add users to groups
      await User.findByIdAndUpdate(testUsers.editor._id, {
        $push: { groups: testGroups.editors._id },
      });

      await User.findByIdAndUpdate(testUsers.viewer._id, {
        $push: { groups: testGroups.viewers._id },
      });
    });

    afterEach(async () => {
      await Prompt.deleteMany({});
      await AclEntry.deleteMany({});
      await User.updateMany({}, { $set: { groups: [] } });
    });

    it('group members should inherit group permissions', async () => {
      // Create a prompt group
      const testPromptGroup = await PromptGroup.create({
        name: 'Group Test Group',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: new ObjectId(),
      });

      const { addUserToGroup } = require('~/models');
      await addUserToGroup(testUsers.editor._id, testGroups.editors._id);

      const prompt = await promptFns.savePrompt({
        author: testUsers.owner._id,
        prompt: {
          prompt: 'Group test prompt',
          name: 'Group Test',
          groupId: testPromptGroup._id,
          type: 'text',
        },
      });

      // Check if savePrompt returned an error
      if (!prompt || !prompt.prompt) {
        throw new Error(`Failed to save prompt: ${prompt?.message || 'Unknown error'}`);
      }

      // Grant edit permissions to the group
      await permissionService.grantPermission({
        principalType: PrincipalType.GROUP,
        principalId: testGroups.editors._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testPromptGroup._id,
        accessRoleId: AccessRoleIds.PROMPTGROUP_EDITOR,
        grantedBy: testUsers.owner._id,
      });

      // Check if group member has access
      const hasAccess = await permissionService.checkPermission({
        userId: testUsers.editor._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testPromptGroup._id,
        requiredPermission: PermissionBits.EDIT,
      });

      expect(hasAccess).toBe(true);

      // Check that non-member doesn't have access
      const nonMemberAccess = await permissionService.checkPermission({
        userId: testUsers.viewer._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testPromptGroup._id,
        requiredPermission: PermissionBits.EDIT,
      });

      expect(nonMemberAccess).toBe(false);
    });
  });

  describe('Public Access', () => {
    let publicPromptGroup, privatePromptGroup;

    beforeEach(async () => {
      // Create separate prompt groups for public and private access
      publicPromptGroup = await PromptGroup.create({
        name: 'Public Access Test Group',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: new ObjectId(),
      });

      privatePromptGroup = await PromptGroup.create({
        name: 'Private Access Test Group',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: new ObjectId(),
      });

      // Create prompts in their respective groups
      await Prompt.create({
        prompt: 'Public prompt',
        name: 'Public',
        author: testUsers.owner._id,
        groupId: publicPromptGroup._id,
        type: 'text',
      });

      await Prompt.create({
        prompt: 'Private prompt',
        name: 'Private',
        author: testUsers.owner._id,
        groupId: privatePromptGroup._id,
        type: 'text',
      });

      // Grant public view access to publicPromptGroup
      await permissionService.grantPermission({
        principalType: PrincipalType.PUBLIC,
        principalId: null,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: publicPromptGroup._id,
        accessRoleId: AccessRoleIds.PROMPTGROUP_VIEWER,
        grantedBy: testUsers.owner._id,
      });

      // Grant only owner access to privatePromptGroup
      await permissionService.grantPermission({
        principalType: PrincipalType.USER,
        principalId: testUsers.owner._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: privatePromptGroup._id,
        accessRoleId: AccessRoleIds.PROMPTGROUP_OWNER,
        grantedBy: testUsers.owner._id,
      });
    });

    afterEach(async () => {
      await Prompt.deleteMany({});
      await PromptGroup.deleteMany({});
      await AclEntry.deleteMany({});
    });

    it('public prompt should be accessible to any user', async () => {
      const hasAccess = await permissionService.checkPermission({
        userId: testUsers.noAccess._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: publicPromptGroup._id,
        requiredPermission: PermissionBits.VIEW,
        includePublic: true,
      });

      expect(hasAccess).toBe(true);
    });

    it('private prompt should not be accessible to unauthorized users', async () => {
      const hasAccess = await permissionService.checkPermission({
        userId: testUsers.noAccess._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: privatePromptGroup._id,
        requiredPermission: PermissionBits.VIEW,
        includePublic: true,
      });

      expect(hasAccess).toBe(false);
    });
  });

  describe('Prompt Deletion', () => {
    let testPromptGroup;

    it('should remove ACL entries when prompt is deleted', async () => {
      testPromptGroup = await PromptGroup.create({
        name: 'Deletion Test Group',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: new ObjectId(),
      });

      const prompt = await promptFns.savePrompt({
        author: testUsers.owner._id,
        prompt: {
          prompt: 'To be deleted',
          name: 'Delete Test',
          groupId: testPromptGroup._id,
          type: 'text',
        },
      });

      // Check if savePrompt returned an error
      if (!prompt || !prompt.prompt) {
        throw new Error(`Failed to save prompt: ${prompt?.message || 'Unknown error'}`);
      }

      const testPromptId = prompt.prompt._id;
      const promptGroupId = testPromptGroup._id;

      // Grant permission
      await permissionService.grantPermission({
        principalType: PrincipalType.USER,
        principalId: testUsers.owner._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testPromptGroup._id,
        accessRoleId: AccessRoleIds.PROMPTGROUP_OWNER,
        grantedBy: testUsers.owner._id,
      });

      // Verify ACL entry exists
      const beforeDelete = await AclEntry.find({
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testPromptGroup._id,
      });
      expect(beforeDelete).toHaveLength(1);

      // Delete the prompt
      await promptFns.deletePrompt({
        promptId: testPromptId,
        groupId: promptGroupId,
        author: testUsers.owner._id,
        role: SystemRoles.USER,
      });

      // Verify ACL entries are removed
      const aclEntries = await AclEntry.find({
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testPromptGroup._id,
      });

      expect(aclEntries).toHaveLength(0);
    });
  });

  describe('Backwards Compatibility', () => {
    it('should handle prompts without ACL entries gracefully', async () => {
      // Create a prompt group first
      const promptGroup = await PromptGroup.create({
        name: 'Legacy Test Group',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: new ObjectId(),
      });

      // Create a prompt without ACL entries (legacy prompt)
      const legacyPrompt = await Prompt.create({
        prompt: 'Legacy prompt without ACL',
        name: 'Legacy',
        author: testUsers.owner._id,
        groupId: promptGroup._id,
        type: 'text',
      });

      // The system should handle this gracefully
      const prompt = await promptFns.getPrompt({ _id: legacyPrompt._id });
      expect(prompt).toBeTruthy();
      expect(prompt._id.toString()).toBe(legacyPrompt._id.toString());
    });
  });
});
