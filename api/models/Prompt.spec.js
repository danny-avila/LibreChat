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

describe('Prompt Model - File Attachments', () => {
  describe('Creating Prompts with tool_resources', () => {
    it('should create a prompt with file attachments in tool_resources', async () => {
      const testGroup = await PromptGroup.create({
        name: 'Attachment Test Group',
        category: 'testing',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: new mongoose.Types.ObjectId(),
      });

      const promptData = {
        prompt: {
          prompt: 'Test prompt with file attachments',
          type: 'text',
          groupId: testGroup._id,
          tool_resources: {
            file_search: {
              file_ids: ['file-1', 'file-2'],
            },
            execute_code: {
              file_ids: ['file-3'],
            },
            image_edit: {
              file_ids: ['file-4'],
            },
          },
        },
        author: testUsers.owner._id,
      };

      const result = await promptFns.savePrompt(promptData);

      expect(result.prompt).toBeTruthy();
      expect(result.prompt.tool_resources).toEqual({
        file_search: {
          file_ids: ['file-1', 'file-2'],
        },
        execute_code: {
          file_ids: ['file-3'],
        },
        image_edit: {
          file_ids: ['file-4'],
        },
      });

      const savedPrompt = await Prompt.findById(result.prompt._id);
      expect(savedPrompt.tool_resources).toEqual(promptData.prompt.tool_resources);
    });

    it('should create a prompt without tool_resources when none provided', async () => {
      const testGroup = await PromptGroup.create({
        name: 'No Attachment Test Group',
        category: 'testing',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: new mongoose.Types.ObjectId(),
      });

      const promptData = {
        prompt: {
          prompt: 'Test prompt without attachments',
          type: 'text',
          groupId: testGroup._id,
        },
        author: testUsers.owner._id,
      };

      const result = await promptFns.savePrompt(promptData);

      expect(result.prompt).toBeTruthy();
      expect(result.prompt.tool_resources).toEqual({});

      const savedPrompt = await Prompt.findById(result.prompt._id);
      expect(savedPrompt.tool_resources).toEqual({});
    });

    it('should create a prompt group with tool_resources', async () => {
      const saveData = {
        prompt: {
          type: 'text',
          prompt: 'Test prompt with file attachments',
          tool_resources: {
            file_search: {
              file_ids: ['file-1', 'file-2'],
            },
            ocr: {
              file_ids: ['file-3'],
            },
          },
        },
        group: {
          name: 'Test Prompt Group with Attachments',
          category: 'test-category',
          oneliner: 'Test description',
        },
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
      };

      const result = await promptFns.createPromptGroup(saveData);

      expect(result.prompt).toBeTruthy();
      expect(result.group).toBeTruthy();
      expect(result.prompt.tool_resources).toEqual({
        file_search: {
          file_ids: ['file-1', 'file-2'],
        },
        ocr: {
          file_ids: ['file-3'],
        },
      });

      expect(result.group.productionPrompt.tool_resources).toEqual(result.prompt.tool_resources);
    });
  });

  describe('Retrieving Prompts with tool_resources', () => {
    let testGroup;
    let testPrompt;

    beforeEach(async () => {
      testGroup = await PromptGroup.create({
        name: 'Retrieval Test Group',
        category: 'testing',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: new mongoose.Types.ObjectId(),
      });

      testPrompt = await Prompt.create({
        prompt: 'Test prompt with attachments for retrieval',
        type: 'text',
        author: testUsers.owner._id,
        groupId: testGroup._id,
        tool_resources: {
          file_search: {
            file_ids: ['file-1', 'file-2'],
          },
          execute_code: {
            file_ids: ['file-3'],
          },
        },
      });
    });

    afterEach(async () => {
      await Prompt.deleteMany({});
      await PromptGroup.deleteMany({});
    });

    it('should retrieve a prompt with tool_resources', async () => {
      const result = await promptFns.getPrompt({ _id: testPrompt._id });

      expect(result).toBeTruthy();
      expect(result.tool_resources).toEqual({
        file_search: {
          file_ids: ['file-1', 'file-2'],
        },
        execute_code: {
          file_ids: ['file-3'],
        },
      });
    });

    it('should retrieve prompts with tool_resources by groupId', async () => {
      const result = await promptFns.getPrompts({ groupId: testGroup._id });

      expect(result).toBeTruthy();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0].tool_resources).toEqual({
        file_search: {
          file_ids: ['file-1', 'file-2'],
        },
        execute_code: {
          file_ids: ['file-3'],
        },
      });
    });

    it('should handle prompts without tool_resources', async () => {
      const promptWithoutAttachments = await Prompt.create({
        prompt: 'Test prompt without attachments',
        type: 'text',
        author: testUsers.owner._id,
        groupId: testGroup._id,
      });

      const result = await promptFns.getPrompt({ _id: promptWithoutAttachments._id });

      expect(result).toBeTruthy();
      expect(result.tool_resources).toBeUndefined();
    });
  });

  describe('Updating Prompts with tool_resources', () => {
    let testGroup;

    beforeEach(async () => {
      testGroup = await PromptGroup.create({
        name: 'Update Test Group',
        category: 'testing',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: new mongoose.Types.ObjectId(),
      });

      await Prompt.create({
        prompt: 'Original prompt',
        type: 'text',
        author: testUsers.owner._id,
        groupId: testGroup._id,
        tool_resources: {
          file_search: {
            file_ids: ['file-1'],
          },
        },
      });
    });

    afterEach(async () => {
      await Prompt.deleteMany({});
      await PromptGroup.deleteMany({});
    });

    it('should update prompt with new tool_resources', async () => {
      const updatedPromptData = {
        prompt: {
          prompt: 'Updated prompt with new attachments',
          type: 'text',
          groupId: testGroup._id,
          tool_resources: {
            file_search: {
              file_ids: ['file-1', 'file-2'],
            },
            execute_code: {
              file_ids: ['file-3'],
            },
          },
        },
        author: testUsers.owner._id,
      };

      const result = await promptFns.savePrompt(updatedPromptData);

      expect(result.prompt).toBeTruthy();
      expect(result.prompt.tool_resources).toEqual({
        file_search: {
          file_ids: ['file-1', 'file-2'],
        },
        execute_code: {
          file_ids: ['file-3'],
        },
      });
    });

    it('should update prompt to remove tool_resources', async () => {
      const updatedPromptData = {
        prompt: {
          prompt: 'Updated prompt without attachments',
          type: 'text',
          groupId: testGroup._id,
          // No tool_resources field
        },
        author: testUsers.owner._id,
      };

      const result = await promptFns.savePrompt(updatedPromptData);

      expect(result.prompt).toBeTruthy();
      expect(result.prompt.tool_resources).toEqual({});
    });
  });

  describe('Deleting Prompts with tool_resources', () => {
    let testGroup;
    let testPrompt;

    beforeEach(async () => {
      testGroup = await PromptGroup.create({
        name: 'Deletion Test Group',
        category: 'testing',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: new mongoose.Types.ObjectId(),
      });

      testPrompt = await Prompt.create({
        prompt: 'Prompt to be deleted',
        type: 'text',
        author: testUsers.owner._id,
        groupId: testGroup._id,
        tool_resources: {
          file_search: {
            file_ids: ['file-1', 'file-2'],
          },
          execute_code: {
            file_ids: ['file-3'],
          },
        },
      });
    });

    afterEach(async () => {
      await Prompt.deleteMany({});
      await PromptGroup.deleteMany({});
    });

    it('should delete a prompt with tool_resources', async () => {
      const result = await promptFns.deletePrompt({
        promptId: testPrompt._id,
        groupId: testGroup._id,
        author: testUsers.owner._id,
        role: SystemRoles.USER,
      });

      expect(result.prompt).toBe('Prompt deleted successfully');

      const deletedPrompt = await Prompt.findById(testPrompt._id);
      expect(deletedPrompt).toBeNull();
    });

    it('should delete prompt group when last prompt with tool_resources is deleted', async () => {
      const result = await promptFns.deletePrompt({
        promptId: testPrompt._id,
        groupId: testGroup._id,
        author: testUsers.owner._id,
        role: SystemRoles.USER,
      });

      expect(result.prompt).toBe('Prompt deleted successfully');
      expect(result.promptGroup).toBeTruthy();
      expect(result.promptGroup.message).toBe('Prompt group deleted successfully');

      const deletedPrompt = await Prompt.findById(testPrompt._id);
      const deletedGroup = await PromptGroup.findById(testGroup._id);
      expect(deletedPrompt).toBeNull();
      expect(deletedGroup).toBeNull();
    });
  });

  describe('Making Prompts Production with tool_resources', () => {
    let testGroup;
    let testPrompt;

    beforeEach(async () => {
      testGroup = await PromptGroup.create({
        name: 'Production Test Group',
        category: 'testing',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: new mongoose.Types.ObjectId(),
      });

      testPrompt = await Prompt.create({
        prompt: 'Prompt to be made production',
        type: 'text',
        author: testUsers.owner._id,
        groupId: testGroup._id,
        tool_resources: {
          file_search: {
            file_ids: ['file-1', 'file-2'],
          },
          image_edit: {
            file_ids: ['file-3'],
          },
        },
      });
    });

    afterEach(async () => {
      await Prompt.deleteMany({});
      await PromptGroup.deleteMany({});
    });

    it('should make a prompt with tool_resources production', async () => {
      const result = await promptFns.makePromptProduction(testPrompt._id.toString());

      expect(result.message).toBe('Prompt production made successfully');

      const updatedGroup = await PromptGroup.findById(testGroup._id);
      expect(updatedGroup.productionId.toString()).toBe(testPrompt._id.toString());
    });

    it('should return error message when prompt not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toString();

      const result = await promptFns.makePromptProduction(nonExistentId);
      expect(result.message).toBe('Error making prompt production');
    });
  });

  describe('Prompt Groups with tool_resources projection', () => {
    let testGroup;
    let testPrompt;

    beforeEach(async () => {
      testGroup = await PromptGroup.create({
        name: 'Projection Test Group',
        category: 'testing',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: new mongoose.Types.ObjectId(),
      });

      testPrompt = await Prompt.create({
        prompt: 'Test prompt for projection',
        type: 'text',
        author: testUsers.owner._id,
        groupId: testGroup._id,
        tool_resources: {
          file_search: {
            file_ids: ['file-1'],
          },
          execute_code: {
            file_ids: ['file-2', 'file-3'],
          },
        },
      });

      await PromptGroup.findByIdAndUpdate(testGroup._id, {
        productionId: testPrompt._id,
      });
    });

    afterEach(async () => {
      await Prompt.deleteMany({});
      await PromptGroup.deleteMany({});
    });

    it('should include tool_resources in prompt group projection', async () => {
      const mockReq = { user: { id: testUsers.owner._id } };
      const filter = {
        pageNumber: 1,
        pageSize: 10,
        category: 'testing',
      };

      const result = await promptFns.getPromptGroups(mockReq, filter);

      expect(result.promptGroups).toBeTruthy();
      expect(Array.isArray(result.promptGroups)).toBe(true);
      expect(result.promptGroups.length).toBeGreaterThan(0);

      const foundGroup = result.promptGroups.find(
        (group) => group._id.toString() === testGroup._id.toString(),
      );
      expect(foundGroup).toBeTruthy();
      expect(foundGroup.productionPrompt.tool_resources).toEqual({
        file_search: {
          file_ids: ['file-1'],
        },
        execute_code: {
          file_ids: ['file-2', 'file-3'],
        },
      });
    });
  });

  describe('Error handling with tool_resources', () => {
    it('should handle errors when creating prompt with tool_resources', async () => {
      const invalidPromptData = {
        prompt: {
          prompt: 'Test prompt',
          type: 'text',
          groupId: 'invalid-id',
          tool_resources: {
            file_search: {
              file_ids: ['file-1'],
            },
          },
        },
        author: testUsers.owner._id,
      };

      const result = await promptFns.savePrompt(invalidPromptData);

      expect(result.message).toBe('Error saving prompt');
    });

    it('should handle errors when retrieving prompt with tool_resources', async () => {
      const result = await promptFns.getPrompt({ _id: 'invalid-id' });

      expect(result.message).toBe('Error getting prompt');
    });
  });

  describe('Edge Cases - File Attachment Scenarios', () => {
    let testGroup;
    let testPrompt;

    beforeEach(async () => {
      testGroup = await PromptGroup.create({
        name: 'Edge Case Test Group',
        category: 'testing',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: new mongoose.Types.ObjectId(),
      });

      testPrompt = await Prompt.create({
        prompt: 'Test prompt with file attachments for edge cases',
        type: 'text',
        author: testUsers.owner._id,
        groupId: testGroup._id,
        tool_resources: {
          file_search: {
            file_ids: ['file-1', 'file-2', 'file-3'],
          },
          execute_code: {
            file_ids: ['file-4'],
          },
          image_edit: {
            file_ids: ['file-5', 'file-6'],
          },
        },
      });
    });

    afterEach(async () => {
      await Prompt.deleteMany({});
      await PromptGroup.deleteMany({});
    });

    describe('Orphaned File References', () => {
      it('should maintain prompt functionality when referenced files are deleted', async () => {
        const result = await promptFns.getPrompt({ _id: testPrompt._id });

        expect(result).toBeTruthy();
        expect(result.tool_resources).toEqual({
          file_search: {
            file_ids: ['file-1', 'file-2', 'file-3'],
          },
          execute_code: {
            file_ids: ['file-4'],
          },
          image_edit: {
            file_ids: ['file-5', 'file-6'],
          },
        });

        expect(result.prompt).toBe('Test prompt with file attachments for edge cases');
        expect(result.type).toBe('text');
      });

      it('should handle prompts with empty file_ids arrays', async () => {
        const promptWithEmptyFileIds = await Prompt.create({
          prompt: 'Prompt with empty file_ids',
          type: 'text',
          author: testUsers.owner._id,
          groupId: testGroup._id,
          tool_resources: {
            file_search: {
              file_ids: [],
            },
            execute_code: {
              file_ids: [],
            },
          },
        });

        const result = await promptFns.getPrompt({ _id: promptWithEmptyFileIds._id });

        expect(result).toBeTruthy();
        expect(result.tool_resources).toEqual({
          file_search: {
            file_ids: [],
          },
          execute_code: {
            file_ids: [],
          },
        });
      });

      it('should handle prompts with null/undefined file_ids', async () => {
        const promptWithNullFileIds = await Prompt.create({
          prompt: 'Prompt with null file_ids',
          type: 'text',
          author: testUsers.owner._id,
          groupId: testGroup._id,
          tool_resources: {
            file_search: {
              file_ids: null,
            },
            execute_code: {
              file_ids: undefined,
            },
          },
        });

        const result = await promptFns.getPrompt({ _id: promptWithNullFileIds._id });

        expect(result).toBeTruthy();
        expect(result.tool_resources).toEqual({
          file_search: {
            file_ids: null,
          },
        });
      });
    });

    describe('Invalid File References', () => {
      it('should handle prompts with malformed file_ids', async () => {
        const promptWithMalformedIds = await Prompt.create({
          prompt: 'Prompt with malformed file_ids',
          type: 'text',
          author: testUsers.owner._id,
          groupId: testGroup._id,
          tool_resources: {
            file_search: {
              file_ids: ['', null, undefined, 'invalid-id', 'file-valid'],
            },
            execute_code: {
              file_ids: [123, {}, []],
            },
          },
        });

        const result = await promptFns.getPrompt({ _id: promptWithMalformedIds._id });

        expect(result).toBeTruthy();
        expect(result.tool_resources).toEqual({
          file_search: {
            file_ids: ['', null, null, 'invalid-id', 'file-valid'],
          },
          execute_code: {
            file_ids: [123, {}, []],
          },
        });
      });

      it('should handle prompts with duplicate file_ids', async () => {
        const promptWithDuplicates = await Prompt.create({
          prompt: 'Prompt with duplicate file_ids',
          type: 'text',
          author: testUsers.owner._id,
          groupId: testGroup._id,
          tool_resources: {
            file_search: {
              file_ids: ['file-1', 'file-2', 'file-1', 'file-3', 'file-2'],
            },
          },
        });

        const result = await promptFns.getPrompt({ _id: promptWithDuplicates._id });

        expect(result).toBeTruthy();
        expect(result.tool_resources).toEqual({
          file_search: {
            file_ids: ['file-1', 'file-2', 'file-1', 'file-3', 'file-2'],
          },
        });
      });
    });

    describe('Tool Resource Edge Cases', () => {
      it('should handle prompts with unknown tool resource types', async () => {
        const promptWithUnknownTools = await Prompt.create({
          prompt: 'Prompt with unknown tool resources',
          type: 'text',
          author: testUsers.owner._id,
          groupId: testGroup._id,
          tool_resources: {
            unknown_tool: {
              file_ids: ['file-1'],
            },
            another_unknown: {
              file_ids: ['file-2', 'file-3'],
            },
            file_search: {
              file_ids: ['file-4'],
            },
          },
        });

        const result = await promptFns.getPrompt({ _id: promptWithUnknownTools._id });

        expect(result).toBeTruthy();
        expect(result.tool_resources).toEqual({
          unknown_tool: {
            file_ids: ['file-1'],
          },
          another_unknown: {
            file_ids: ['file-2', 'file-3'],
          },
          file_search: {
            file_ids: ['file-4'],
          },
        });
      });

      it('should handle prompts with malformed tool_resources structure', async () => {
        const promptWithMalformedTools = await Prompt.create({
          prompt: 'Prompt with malformed tool_resources',
          type: 'text',
          author: testUsers.owner._id,
          groupId: testGroup._id,
          tool_resources: {
            file_search: 'not-an-object',
            execute_code: {
              file_ids: 'not-an-array',
            },
            image_edit: {
              wrong_property: ['file-1'],
            },
          },
        });

        const result = await promptFns.getPrompt({ _id: promptWithMalformedTools._id });

        expect(result).toBeTruthy();
        expect(result.tool_resources).toEqual({
          file_search: 'not-an-object',
          execute_code: {
            file_ids: 'not-an-array',
          },
          image_edit: {
            wrong_property: ['file-1'],
          },
        });
      });
    });

    describe('Prompt Deletion vs File Persistence', () => {
      it('should delete prompt but preserve file references in tool_resources', async () => {
        const beforeDelete = await promptFns.getPrompt({ _id: testPrompt._id });
        expect(beforeDelete.tool_resources).toEqual({
          file_search: {
            file_ids: ['file-1', 'file-2', 'file-3'],
          },
          execute_code: {
            file_ids: ['file-4'],
          },
          image_edit: {
            file_ids: ['file-5', 'file-6'],
          },
        });

        const result = await promptFns.deletePrompt({
          promptId: testPrompt._id,
          groupId: testGroup._id,
          author: testUsers.owner._id,
          role: SystemRoles.USER,
        });

        expect(result.prompt).toBe('Prompt deleted successfully');

        const deletedPrompt = await Prompt.findById(testPrompt._id);
        expect(deletedPrompt).toBeNull();
      });

      it('should handle prompt deletion when tool_resources contain non-existent files', async () => {
        const promptWithNonExistentFiles = await Prompt.create({
          prompt: 'Prompt with non-existent file references',
          type: 'text',
          author: testUsers.owner._id,
          groupId: testGroup._id,
          tool_resources: {
            file_search: {
              file_ids: ['non-existent-file-1', 'non-existent-file-2'],
            },
          },
        });

        const result = await promptFns.deletePrompt({
          promptId: promptWithNonExistentFiles._id,
          groupId: testGroup._id,
          author: testUsers.owner._id,
          role: SystemRoles.USER,
        });

        expect(result.prompt).toBe('Prompt deleted successfully');

        const deletedPrompt = await Prompt.findById(promptWithNonExistentFiles._id);
        expect(deletedPrompt).toBeNull();
      });
    });

    describe('Large File Collections', () => {
      it('should handle prompts with many file attachments', async () => {
        const manyFileIds = Array.from({ length: 100 }, (_, i) => `file-${i + 1}`);

        const promptWithManyFiles = await Prompt.create({
          prompt: 'Prompt with many file attachments',
          type: 'text',
          author: testUsers.owner._id,
          groupId: testGroup._id,
          tool_resources: {
            file_search: {
              file_ids: manyFileIds.slice(0, 50),
            },
            execute_code: {
              file_ids: manyFileIds.slice(50, 100),
            },
          },
        });

        const result = await promptFns.getPrompt({ _id: promptWithManyFiles._id });

        expect(result).toBeTruthy();
        expect(result.tool_resources.file_search.file_ids).toHaveLength(50);
        expect(result.tool_resources.execute_code.file_ids).toHaveLength(50);
        expect(result.tool_resources.file_search.file_ids[0]).toBe('file-1');
        expect(result.tool_resources.execute_code.file_ids[49]).toBe('file-100');
      });

      it('should handle prompts with very long file_ids', async () => {
        const longFileId = 'a'.repeat(1000);

        const promptWithLongFileId = await Prompt.create({
          prompt: 'Prompt with very long file ID',
          type: 'text',
          author: testUsers.owner._id,
          groupId: testGroup._id,
          tool_resources: {
            file_search: {
              file_ids: [longFileId],
            },
          },
        });

        const result = await promptFns.getPrompt({ _id: promptWithLongFileId._id });

        expect(result).toBeTruthy();
        expect(result.tool_resources.file_search.file_ids[0]).toBe(longFileId);
        expect(result.tool_resources.file_search.file_ids[0].length).toBe(1000);
      });
    });

    describe('Concurrent Operations', () => {
      it('should handle concurrent updates to prompts with tool_resources', async () => {
        const concurrentPrompts = await Promise.all([
          Prompt.create({
            prompt: 'Concurrent prompt 1',
            type: 'text',
            author: testUsers.owner._id,
            groupId: testGroup._id,
            tool_resources: {
              file_search: {
                file_ids: ['shared-file-1', 'unique-file-1'],
              },
            },
          }),
          Prompt.create({
            prompt: 'Concurrent prompt 2',
            type: 'text',
            author: testUsers.owner._id,
            groupId: testGroup._id,
            tool_resources: {
              file_search: {
                file_ids: ['shared-file-1', 'unique-file-2'],
              },
            },
          }),
          Prompt.create({
            prompt: 'Concurrent prompt 3',
            type: 'text',
            author: testUsers.owner._id,
            groupId: testGroup._id,
            tool_resources: {
              file_search: {
                file_ids: ['shared-file-1', 'unique-file-3'],
              },
            },
          }),
        ]);

        expect(concurrentPrompts).toHaveLength(3);
        concurrentPrompts.forEach((prompt, index) => {
          expect(prompt.tool_resources.file_search.file_ids).toContain('shared-file-1');
          expect(prompt.tool_resources.file_search.file_ids).toContain(`unique-file-${index + 1}`);
        });

        const retrievedPrompts = await promptFns.getPrompts({ groupId: testGroup._id });
        expect(retrievedPrompts.length).toBeGreaterThanOrEqual(3);
      });
    });
  });
});
