const { ObjectId } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { logger, PermissionBits } = require('@librechat/data-schemas');
const { Constants } = require('librechat-data-provider');

// Mock the config/connect module to prevent connection attempts during tests
jest.mock('../../config/connect', () => jest.fn().mockResolvedValue(true));

// Disable console for tests
logger.silent = true;

describe('Prompt Migration Script', () => {
  let mongoServer;
  let Prompt, PromptGroup, AclEntry, AccessRole, User, Project;
  let migratePromptPermissions;
  let testOwner, testProject;
  let ownerRole, viewerRole;

  beforeAll(async () => {
    // Set up MongoDB memory server
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
    Project = dbModels.Project;

    // Create test user
    testOwner = await User.create({
      name: 'Test Owner',
      email: 'owner@test.com',
      role: 'USER',
    });

    // Create test project with the proper name
    const projectName = Constants.GLOBAL_PROJECT_NAME || 'instance';
    testProject = await Project.create({
      name: projectName,
      description: 'Global project',
      promptGroupIds: [],
    });

    // Create access roles
    ownerRole = await AccessRole.create({
      accessRoleId: 'prompt_owner',
      name: 'Owner',
      description: 'Full control over prompts',
      resourceType: 'prompt',
      permBits:
        PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.DELETE | PermissionBits.SHARE,
    });

    viewerRole = await AccessRole.create({
      accessRoleId: 'prompt_viewer',
      name: 'Viewer',
      description: 'Can view prompts',
      resourceType: 'prompt',
      permBits: PermissionBits.VIEW,
    });

    await AccessRole.create({
      accessRoleId: 'prompt_editor',
      name: 'Editor',
      description: 'Can view and edit prompts',
      resourceType: 'prompt',
      permBits: PermissionBits.VIEW | PermissionBits.EDIT,
    });

    // Import migration function
    const migration = require('../../config/migrate-prompt-permissions');
    migratePromptPermissions = migration.migratePromptPermissions;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clean up before each test
    await Prompt.deleteMany({});
    await PromptGroup.deleteMany({});
    await AclEntry.deleteMany({});
    // Reset the project's promptGroupIds array
    testProject.promptGroupIds = [];
    await testProject.save();
  });

  it('should categorize prompts correctly in dry run', async () => {
    // Create global prompt group (in Global project)
    const globalPromptGroup = await PromptGroup.create({
      name: 'Global Group',
      author: testOwner._id,
      authorName: testOwner.name,
      productionId: new ObjectId(),
    });

    // Create private prompt group (not in any project)
    const privatePromptGroup = await PromptGroup.create({
      name: 'Private Group',
      author: testOwner._id,
      authorName: testOwner.name,
      productionId: new ObjectId(),
    });

    // Add global group to project's promptGroupIds array
    testProject.promptGroupIds = [globalPromptGroup._id];
    await testProject.save();

    // Create prompts
    await Prompt.create({
      prompt: 'Global prompt',
      name: 'Global',
      author: testOwner._id,
      groupId: globalPromptGroup._id,
      type: 'text',
    });

    await Prompt.create({
      prompt: 'Private prompt',
      name: 'Private',
      author: testOwner._id,
      groupId: privatePromptGroup._id,
      type: 'text',
    });

    const result = await migratePromptPermissions({ dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.summary.total).toBe(2);
    expect(result.summary.globalViewAccess).toBe(1);
    expect(result.summary.privatePrompts).toBe(1);
  });

  it('should grant appropriate permissions during migration', async () => {
    // Create prompt groups
    const globalPromptGroup = await PromptGroup.create({
      name: 'Global Group',
      author: testOwner._id,
      authorName: testOwner.name,
      productionId: new ObjectId(),
    });

    const privatePromptGroup = await PromptGroup.create({
      name: 'Private Group',
      author: testOwner._id,
      authorName: testOwner.name,
      productionId: new ObjectId(),
    });

    // Add global group to project's promptGroupIds array
    testProject.promptGroupIds = [globalPromptGroup._id];
    await testProject.save();

    // Create prompts
    const globalPrompt = await Prompt.create({
      prompt: 'Global prompt',
      name: 'Global',
      author: testOwner._id,
      groupId: globalPromptGroup._id,
      type: 'text',
    });

    const privatePrompt = await Prompt.create({
      prompt: 'Private prompt',
      name: 'Private',
      author: testOwner._id,
      groupId: privatePromptGroup._id,
      type: 'text',
    });

    const result = await migratePromptPermissions({ dryRun: false });

    expect(result.migrated).toBe(2);
    expect(result.errors).toBe(0);
    expect(result.ownerGrants).toBe(2);
    expect(result.publicViewGrants).toBe(1);

    // Check global prompt permissions
    const globalOwnerEntry = await AclEntry.findOne({
      resourceType: 'prompt',
      resourceId: globalPrompt._id,
      principalType: 'user',
      principalId: testOwner._id,
    });
    expect(globalOwnerEntry).toBeTruthy();
    expect(globalOwnerEntry.permBits).toBe(ownerRole.permBits);

    const globalPublicEntry = await AclEntry.findOne({
      resourceType: 'prompt',
      resourceId: globalPrompt._id,
      principalType: 'public',
    });
    expect(globalPublicEntry).toBeTruthy();
    expect(globalPublicEntry.permBits).toBe(viewerRole.permBits);

    // Check private prompt permissions
    const privateOwnerEntry = await AclEntry.findOne({
      resourceType: 'prompt',
      resourceId: privatePrompt._id,
      principalType: 'user',
      principalId: testOwner._id,
    });
    expect(privateOwnerEntry).toBeTruthy();
    expect(privateOwnerEntry.permBits).toBe(ownerRole.permBits);

    const privatePublicEntry = await AclEntry.findOne({
      resourceType: 'prompt',
      resourceId: privatePrompt._id,
      principalType: 'public',
    });
    expect(privatePublicEntry).toBeNull();
  });

  it('should skip prompts that already have ACL entries', async () => {
    // Create prompts
    const promptGroup = await PromptGroup.create({
      name: 'Test Group',
      author: testOwner._id,
      authorName: testOwner.name,
      productionId: new ObjectId(),
    });

    const prompt1 = await Prompt.create({
      prompt: 'Prompt 1',
      name: 'First',
      author: testOwner._id,
      groupId: promptGroup._id,
      type: 'text',
    });

    const prompt2 = await Prompt.create({
      prompt: 'Prompt 2',
      name: 'Second',
      author: testOwner._id,
      groupId: promptGroup._id,
      type: 'text',
    });

    // Grant permission to one prompt manually (simulating it already has ACL)
    await AclEntry.create({
      principalType: 'user',
      principalId: testOwner._id,
      principalModel: 'User',
      resourceType: 'prompt',
      resourceId: prompt1._id,
      permBits: ownerRole.permBits,
      roleId: ownerRole._id,
      grantedBy: testOwner._id,
      grantedAt: new Date(),
    });

    const result = await migratePromptPermissions({ dryRun: false });

    // Should only migrate prompt2, skip prompt1
    expect(result.migrated).toBe(1);
    expect(result.errors).toBe(0);

    // Verify prompt2 now has permissions
    const prompt2Entry = await AclEntry.findOne({
      resourceType: 'prompt',
      resourceId: prompt2._id,
    });
    expect(prompt2Entry).toBeTruthy();
  });
});
