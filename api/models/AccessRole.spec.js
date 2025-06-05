const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { PermissionBits, RoleBits } = require('@librechat/data-schemas');
const {
  AccessRole,
  findRoleById,
  findRoleByIdentifier,
  findRolesByResourceType,
  findRoleByPermissions,
  createRole,
  updateRole,
  deleteRole,
  getAllRoles,
  seedDefaultRoles,
  getRoleForPermissions
} = require('./AccessRole');

let mongoServer;

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
});

describe('AccessRole Model Tests', () => {
  describe('Basic CRUD Operations', () => {
    const sampleRole = {
      accessRoleId: 'test_viewer',
      name: 'Test Viewer',
      description: 'Test role for viewer permissions',
      resourceType: 'agent',
      permBits: RoleBits.VIEWER
    };

    test('should create a new role', async () => {
      const role = await createRole(sampleRole);
      
      expect(role).toBeDefined();
      expect(role.accessRoleId).toBe(sampleRole.accessRoleId);
      expect(role.name).toBe(sampleRole.name);
      expect(role.permBits).toBe(sampleRole.permBits);
    });

    test('should find a role by its ID', async () => {
      const createdRole = await createRole(sampleRole);
      const foundRole = await findRoleById(createdRole._id);
      
      expect(foundRole).toBeDefined();
      expect(foundRole._id.toString()).toBe(createdRole._id.toString());
      expect(foundRole.accessRoleId).toBe(sampleRole.accessRoleId);
    });

    test('should find a role by its identifier', async () => {
      await createRole(sampleRole);
      const foundRole = await findRoleByIdentifier(sampleRole.accessRoleId);
      
      expect(foundRole).toBeDefined();
      expect(foundRole.accessRoleId).toBe(sampleRole.accessRoleId);
      expect(foundRole.name).toBe(sampleRole.name);
    });

    test('should update an existing role', async () => {
      await createRole(sampleRole);
      
      const updatedData = {
        name: 'Updated Test Role',
        description: 'Updated description'
      };
      
      const updatedRole = await updateRole(sampleRole.accessRoleId, updatedData);
      
      expect(updatedRole).toBeDefined();
      expect(updatedRole.name).toBe(updatedData.name);
      expect(updatedRole.description).toBe(updatedData.description);
      // Check that other fields remain unchanged
      expect(updatedRole.accessRoleId).toBe(sampleRole.accessRoleId);
      expect(updatedRole.permBits).toBe(sampleRole.permBits);
    });

    test('should delete a role', async () => {
      await createRole(sampleRole);
      
      const deleteResult = await deleteRole(sampleRole.accessRoleId);
      expect(deleteResult.deletedCount).toBe(1);
      
      const foundRole = await findRoleByIdentifier(sampleRole.accessRoleId);
      expect(foundRole).toBeNull();
    });

    test('should get all roles', async () => {
      const roles = [
        sampleRole,
        {
          accessRoleId: 'test_editor',
          name: 'Test Editor',
          description: 'Test role for editor permissions',
          resourceType: 'agent',
          permBits: RoleBits.EDITOR
        }
      ];
      
      await Promise.all(roles.map(role => createRole(role)));
      
      const allRoles = await getAllRoles();
      expect(allRoles).toHaveLength(2);
      expect(allRoles.map(r => r.accessRoleId).sort()).toEqual(['test_editor', 'test_viewer'].sort());
    });
  });

  describe('Resource and Permission Queries', () => {
    beforeEach(async () => {
      await AccessRole.deleteMany({});

      // Create sample roles for testing
      await Promise.all([
        createRole({
          accessRoleId: 'agent_viewer',
          name: 'Agent Viewer',
          description: 'Can view agents',
          resourceType: 'agent',
          permBits: RoleBits.VIEWER
        }),
        createRole({
          accessRoleId: 'agent_editor',
          name: 'Agent Editor',
          description: 'Can edit agents',
          resourceType: 'agent',
          permBits: RoleBits.EDITOR
        }),
        createRole({
          accessRoleId: 'project_viewer',
          name: 'Project Viewer',
          description: 'Can view projects',
          resourceType: 'project',
          permBits: RoleBits.VIEWER
        }),
        createRole({
          accessRoleId: 'project_editor',
          name: 'Project Editor',
          description: 'Can edit projects',
          resourceType: 'project',
          permBits: RoleBits.EDITOR
        })
      ]);
    });

    test('should find roles by resource type', async () => {
      const agentRoles = await findRolesByResourceType('agent');
      expect(agentRoles).toHaveLength(2);
      expect(agentRoles.map(r => r.accessRoleId).sort()).toEqual(['agent_editor', 'agent_viewer'].sort());
      
      const projectRoles = await findRolesByResourceType('project');
      expect(projectRoles).toHaveLength(2);
      expect(projectRoles.map(r => r.accessRoleId).sort()).toEqual(['project_editor', 'project_viewer'].sort());
    });

    test('should find role by permissions', async () => {
      const viewerRole = await findRoleByPermissions('agent', RoleBits.VIEWER);
      expect(viewerRole).toBeDefined();
      expect(viewerRole.accessRoleId).toBe('agent_viewer');
      
      const editorRole = await findRoleByPermissions('agent', RoleBits.EDITOR);
      expect(editorRole).toBeDefined();
      expect(editorRole.accessRoleId).toBe('agent_editor');
    });

    test('should return null when no role matches the permissions', async () => {
      // Create a custom permission that doesn't match any existing role
      const customPerm = PermissionBits.VIEW | PermissionBits.SHARE;
      const role = await findRoleByPermissions('agent', customPerm);
      expect(role).toBeNull();
    });
  });

  describe('seedDefaultRoles', () => {
    beforeEach(async () => {
      await AccessRole.deleteMany({});
    });

    test('should seed default roles', async () => {
      const result = await seedDefaultRoles();
      
      // Verify the result contains the default roles
      expect(Object.keys(result).sort()).toEqual(['agent_editor', 'agent_owner', 'agent_viewer'].sort());
      
      // Verify each role exists in the database
      const agentViewerRole = await findRoleByIdentifier('agent_viewer');
      expect(agentViewerRole).toBeDefined();
      expect(agentViewerRole.permBits).toBe(RoleBits.VIEWER);
      
      const agentEditorRole = await findRoleByIdentifier('agent_editor');
      expect(agentEditorRole).toBeDefined();
      expect(agentEditorRole.permBits).toBe(RoleBits.EDITOR);
      
      const agentOwnerRole = await findRoleByIdentifier('agent_owner');
      expect(agentOwnerRole).toBeDefined();
      expect(agentOwnerRole.permBits).toBe(RoleBits.OWNER);
    });

    test('should not modify existing roles when seeding', async () => {
      // Create a modified version of a default role
      const customRole = {
        accessRoleId: 'agent_viewer',
        name: 'Custom Viewer',
        description: 'Custom viewer description',
        resourceType: 'agent',
        permBits: RoleBits.VIEWER
      };
      
      await createRole(customRole);
      
      // Seed default roles
      await seedDefaultRoles();
      
      // Verify the custom role was not modified
      const role = await findRoleByIdentifier('agent_viewer');
      expect(role.name).toBe(customRole.name);
      expect(role.description).toBe(customRole.description);
    });
  });

  describe('getRoleForPermissions', () => {
    beforeEach(async () => {
      await AccessRole.deleteMany({});
      
      // Create sample roles with ascending permission levels
      await Promise.all([
        createRole({
          accessRoleId: 'agent_viewer',
          name: 'Agent Viewer',
          resourceType: 'agent',
          permBits: RoleBits.VIEWER // 1
        }),
        createRole({
          accessRoleId: 'agent_editor',
          name: 'Agent Editor',
          resourceType: 'agent',
          permBits: RoleBits.EDITOR // 3
        }),
        createRole({
          accessRoleId: 'agent_manager',
          name: 'Agent Manager',
          resourceType: 'agent',
          permBits: RoleBits.MANAGER // 7
        }),
        createRole({
          accessRoleId: 'agent_owner',
          name: 'Agent Owner',
          resourceType: 'agent',
          permBits: RoleBits.OWNER // 15
        })
      ]);
    });

    test('should find exact matching role', async () => {
      const role = await getRoleForPermissions('agent', RoleBits.EDITOR);
      expect(role).toBeDefined();
      expect(role.accessRoleId).toBe('agent_editor');
      expect(role.permBits).toBe(RoleBits.EDITOR);
    });

    test('should find closest compatible role without exceeding permissions', async () => {
      // Create a custom permission between VIEWER and EDITOR
      const customPerm = PermissionBits.VIEW | PermissionBits.SHARE; // 9
      
      // Should return VIEWER (1) as closest matching role without exceeding the permission bits
      const role = await getRoleForPermissions('agent', customPerm);
      expect(role).toBeDefined();
      expect(role.accessRoleId).toBe('agent_viewer');
    });

    test('should return null when no compatible role is found', async () => {
      // Create a permission that doesn't match any existing permission pattern
      const invalidPerm = 100;
      
      const role = await getRoleForPermissions('agent', invalidPerm);
      expect(role).toBeNull();
    });

    test('should find role for resource-specific permissions', async () => {
      // Create a role for a different resource type
      await createRole({
        accessRoleId: 'project_viewer',
        name: 'Project Viewer',
        resourceType: 'project',
        permBits: RoleBits.VIEWER
      });
      
      // Query for agent roles
      const agentRole = await getRoleForPermissions('agent', RoleBits.VIEWER);
      expect(agentRole).toBeDefined();
      expect(agentRole.accessRoleId).toBe('agent_viewer');
      
      // Query for project roles
      const projectRole = await getRoleForPermissions('project', RoleBits.VIEWER);
      expect(projectRole).toBeDefined();
      expect(projectRole.accessRoleId).toBe('project_viewer');
    });
  });
});