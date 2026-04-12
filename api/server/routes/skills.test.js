const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  SystemRoles,
  ResourceType,
  AccessRoleIds,
  PrincipalType,
  PermissionBits,
} = require('librechat-data-provider');

jest.mock('~/server/services/Config', () => ({
  getCachedTools: jest.fn().mockResolvedValue({}),
  getAppConfig: jest.fn().mockResolvedValue({
    fileStrategy: 'local',
    paths: { uploads: '/tmp/uploads', images: '/tmp/images' },
  }),
}));

jest.mock('~/server/middleware/config/app', () => (req, _res, next) => {
  req.config = {
    fileStrategy: 'local',
    paths: { uploads: '/tmp/uploads', images: '/tmp/images' },
  };
  next();
});

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn().mockReturnValue({
    saveBuffer: jest.fn().mockResolvedValue('/uploads/test/file.txt'),
    getDownloadStream: jest.fn().mockResolvedValue({
      pipe: jest.fn(),
      on: jest.fn(),
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from('test content');
      },
    }),
  }),
}));

jest.mock('~/server/utils/getFileStrategy', () => ({
  getFileStrategy: jest.fn().mockReturnValue('local'),
}));

jest.mock('~/models', () => {
  const mongoose = require('mongoose');
  const { createMethods } = require('@librechat/data-schemas');
  const methods = createMethods(mongoose, {
    removeAllPermissions: async ({ resourceType, resourceId }) => {
      const AclEntry = mongoose.models.AclEntry;
      if (AclEntry) {
        await AclEntry.deleteMany({ resourceType, resourceId });
      }
    },
  });
  // Override getRoleByName to return a permissive SKILLS capability block for all
  // test users. The real role seeding relies on `initializeRoles` which this
  // suite intentionally skips to keep setup minimal.
  return {
    ...methods,
    getRoleByName: jest.fn(),
  };
});

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => next(),
  canAccessSkillResource: jest.requireActual('~/server/middleware').canAccessSkillResource,
}));

let app;
let mongoServer;
let skillRoutes;
let Skill;
let SkillFile;
let AclEntry;
let AccessRole;
let User;
let testUsers;
let testRoles;
let grantPermission;
let currentTestUser;

function setTestUser(user) {
  currentTestUser = user;
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const dbModels = require('~/db/models');
  Skill = dbModels.Skill;
  SkillFile = dbModels.SkillFile;
  AclEntry = dbModels.AclEntry;
  AccessRole = dbModels.AccessRole;
  User = dbModels.User;

  const permissionService = require('~/server/services/PermissionService');
  grantPermission = permissionService.grantPermission;

  await setupTestData();

  app = express();
  app.use(express.json());
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

  currentTestUser = testUsers.owner;
  skillRoutes = require('./skills');
  app.use('/api/skills', skillRoutes);
});

afterEach(async () => {
  await Skill.deleteMany({});
  await SkillFile.deleteMany({});
  await AclEntry.deleteMany({});
  currentTestUser = testUsers.owner;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  jest.clearAllMocks();
});

async function setupTestData() {
  testRoles = {
    viewer: await AccessRole.create({
      accessRoleId: AccessRoleIds.SKILL_VIEWER,
      name: 'Viewer',
      resourceType: ResourceType.SKILL,
      permBits: PermissionBits.VIEW,
    }),
    editor: await AccessRole.create({
      accessRoleId: AccessRoleIds.SKILL_EDITOR,
      name: 'Editor',
      resourceType: ResourceType.SKILL,
      permBits: PermissionBits.VIEW | PermissionBits.EDIT,
    }),
    owner: await AccessRole.create({
      accessRoleId: AccessRoleIds.SKILL_OWNER,
      name: 'Owner',
      resourceType: ResourceType.SKILL,
      permBits:
        PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.DELETE | PermissionBits.SHARE,
    }),
  };

  testUsers = {
    owner: await User.create({
      name: 'Skill Owner',
      email: 'skill-owner@test.com',
      role: SystemRoles.USER,
    }),
    editor: await User.create({
      name: 'Skill Editor',
      email: 'skill-editor@test.com',
      role: SystemRoles.USER,
    }),
    noAccess: await User.create({
      name: 'No Access',
      email: 'no-access@test.com',
      role: SystemRoles.USER,
    }),
  };

  const { getRoleByName } = require('~/models');
  getRoleByName.mockImplementation((roleName) => {
    if (roleName === SystemRoles.USER || roleName === SystemRoles.ADMIN) {
      return {
        permissions: {
          SKILLS: {
            USE: true,
            CREATE: true,
            SHARE: true,
            SHARE_PUBLIC: true,
          },
        },
      };
    }
    return null;
  });
}

async function createSkillAsOwner(overrides = {}) {
  // Description is deliberately kept above the 20-char short-description
  // warning threshold so existing tests don't trip the coaching warning.
  const res = await request(app)
    .post('/api/skills')
    .send({
      name: 'demo-skill',
      description: 'A small demo skill used in routing integration tests.',
      body: '# Demo',
      ...overrides,
    });
  return res;
}

describe('Skill routes', () => {
  let errSpy;
  beforeEach(() => {
    errSpy = jest.spyOn(console, 'error').mockImplementation();
  });
  afterEach(() => errSpy.mockRestore());

  describe('POST /api/skills', () => {
    it('creates a skill and grants SKILL_OWNER ACL', async () => {
      const res = await createSkillAsOwner();
      expect(res.status).toBe(201);
      expect(res.body._id).toBeDefined();
      expect(res.body.version).toBe(1);
      expect(res.body.name).toBe('demo-skill');
      // No warnings on a description that comfortably clears the threshold.
      expect(res.body.warnings).toBeUndefined();

      const acl = await AclEntry.findOne({
        resourceType: ResourceType.SKILL,
        resourceId: res.body._id,
        principalType: PrincipalType.USER,
        principalId: testUsers.owner._id,
      });
      expect(acl).toBeTruthy();
      expect(acl.roleId.toString()).toBe(testRoles.owner._id.toString());
    });

    it('attaches a TOO_SHORT warning on create when description is under 20 chars', async () => {
      const res = await createSkillAsOwner({
        name: 'short-desc-skill',
        description: 'Too short.',
      });
      expect(res.status).toBe(201);
      expect(res.body._id).toBeDefined();
      expect(Array.isArray(res.body.warnings)).toBe(true);
      expect(res.body.warnings).toEqual([
        expect.objectContaining({
          field: 'description',
          code: 'TOO_SHORT',
          severity: 'warning',
        }),
      ]);
    });

    it('rejects names starting with reserved brand prefixes', async () => {
      const anthropic = await createSkillAsOwner({ name: 'anthropic-helper' });
      expect(anthropic.status).toBe(400);
      const claude = await createSkillAsOwner({ name: 'claude-helper' });
      expect(claude.status).toBe(400);
    });

    it('allows names that merely contain reserved brand words as substrings', async () => {
      const res = await createSkillAsOwner({ name: 'research-anthropic-helper' });
      expect(res.status).toBe(201);
    });

    it('rejects reserved CLI command names', async () => {
      const res = await createSkillAsOwner({ name: 'settings' });
      expect(res.status).toBe(400);
    });

    it('rejects frontmatter with unknown keys', async () => {
      const res = await createSkillAsOwner({
        name: 'bad-frontmatter-skill',
        frontmatter: { 'not-a-real-key': 'value' },
      });
      expect(res.status).toBe(400);
      expect(res.body.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'UNKNOWN_KEY' })]),
      );
    });

    it('rejects missing description with 400', async () => {
      const res = await request(app).post('/api/skills').send({ name: 'x-skill', body: '' });
      expect(res.status).toBe(400);
    });

    it('rejects invalid name with 400 validation failure', async () => {
      const res = await createSkillAsOwner({ name: 'BAD NAME' });
      expect(res.status).toBe(400);
      expect(res.body.issues).toBeDefined();
    });

    it('rejects duplicate names with 409', async () => {
      const a = await createSkillAsOwner();
      expect(a.status).toBe(201);
      const b = await createSkillAsOwner();
      expect(b.status).toBe(409);
    });
  });

  describe('GET /api/skills', () => {
    it('returns only skills the caller can access', async () => {
      const mine = await createSkillAsOwner({ name: 'mine-skill' });
      expect(mine.status).toBe(201);

      setTestUser(testUsers.noAccess);
      const other = await createSkillAsOwner({ name: 'other-skill' });
      expect(other.status).toBe(201);
      // Note: the user middleware grants owner perms to whichever user created, so both
      // users see their own skill only.

      setTestUser(testUsers.owner);
      const res = await request(app).get('/api/skills');
      expect(res.status).toBe(200);
      expect(res.body.skills.length).toBe(1);
      expect(res.body.skills[0].name).toBe('mine-skill');
    });
  });

  describe('GET /api/skills/:id', () => {
    it('returns 403 when the user has no access', async () => {
      const created = await createSkillAsOwner();
      expect(created.status).toBe(201);
      setTestUser(testUsers.noAccess);
      const res = await request(app).get(`/api/skills/${created.body._id}`);
      expect(res.status).toBe(403);
    });

    it('returns the skill to the owner with isPublic flag', async () => {
      const created = await createSkillAsOwner();
      const res = await request(app).get(`/api/skills/${created.body._id}`);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('demo-skill');
      expect(res.body.isPublic).toBe(false);
    });
  });

  describe('PATCH /api/skills/:id (optimistic concurrency)', () => {
    it('updates with correct expectedVersion and bumps version', async () => {
      const created = await createSkillAsOwner();
      const res = await request(app)
        .patch(`/api/skills/${created.body._id}`)
        .send({ expectedVersion: 1, description: 'Updated description' });
      expect(res.status).toBe(200);
      expect(res.body.version).toBe(2);
      expect(res.body.description).toBe('Updated description');
    });

    it('returns 409 on stale expectedVersion', async () => {
      const created = await createSkillAsOwner();
      const first = await request(app)
        .patch(`/api/skills/${created.body._id}`)
        .send({ expectedVersion: 1, description: 'First' });
      expect(first.status).toBe(200);

      const stale = await request(app)
        .patch(`/api/skills/${created.body._id}`)
        .send({ expectedVersion: 1, description: 'Stale' });
      expect(stale.status).toBe(409);
      expect(stale.body.error).toBe('skill_version_conflict');
      expect(stale.body.current.version).toBe(2);
    });

    it('rejects updates without expectedVersion', async () => {
      const created = await createSkillAsOwner();
      const res = await request(app)
        .patch(`/api/skills/${created.body._id}`)
        .send({ description: 'no version' });
      expect(res.status).toBe(400);
    });

    it('returns 403 for a user without EDIT permission', async () => {
      const created = await createSkillAsOwner();
      setTestUser(testUsers.noAccess);
      const res = await request(app)
        .patch(`/api/skills/${created.body._id}`)
        .send({ expectedVersion: 1, description: 'nope' });
      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/skills/:id', () => {
    it('deletes and cascades ACL entries', async () => {
      const created = await createSkillAsOwner();
      const res = await request(app).delete(`/api/skills/${created.body._id}`);
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);

      const remainingAcl = await AclEntry.countDocuments({
        resourceType: ResourceType.SKILL,
        resourceId: created.body._id,
      });
      expect(remainingAcl).toBe(0);
    });

    it('returns 403 for a non-owner', async () => {
      const created = await createSkillAsOwner();
      setTestUser(testUsers.noAccess);
      const res = await request(app).delete(`/api/skills/${created.body._id}`);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/skills/:id/files', () => {
    it('returns an empty list for a skill with no files', async () => {
      const created = await createSkillAsOwner();
      const res = await request(app).get(`/api/skills/${created.body._id}/files`);
      expect(res.status).toBe(200);
      expect(res.body.files).toEqual([]);
    });
  });

  describe('POST /api/skills/:id/files (live)', () => {
    it('returns 400 when no file is provided', async () => {
      const created = await createSkillAsOwner();
      const res = await request(app).post(`/api/skills/${created.body._id}/files`);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/no file/i);
    });
  });

  describe('GET /api/skills/:id/files/:relativePath', () => {
    it('returns SKILL.md content from skill body', async () => {
      const created = await createSkillAsOwner();
      const res = await request(app).get(`/api/skills/${created.body._id}/files/SKILL.md`);
      expect(res.status).toBe(200);
      expect(res.body.mimeType).toBe('text/markdown');
      expect(res.body.isBinary).toBe(false);
      expect(res.body.filename).toBe('SKILL.md');
      expect(res.body.content).toBeDefined();
    });

    it('returns 404 for a nonexistent file', async () => {
      const created = await createSkillAsOwner();
      const res = await request(app).get(
        `/api/skills/${created.body._id}/files/scripts%2Fmissing.sh`,
      );
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/skills/:id/files/:relativePath', () => {
    const { upsertSkillFile } = require('~/models');

    it('deletes an existing skill file, bumps skill version, and returns 200', async () => {
      const created = await createSkillAsOwner();
      await upsertSkillFile({
        skillId: created.body._id,
        relativePath: 'scripts/parse.sh',
        file_id: 'file-1',
        filename: 'parse.sh',
        filepath: '/tmp/parse.sh',
        source: 'local',
        mimeType: 'text/x-shellscript',
        bytes: 42,
        author: testUsers.owner._id,
      });

      const beforeSkill = await request(app).get(`/api/skills/${created.body._id}`);
      expect(beforeSkill.body.fileCount).toBe(1);
      expect(beforeSkill.body.version).toBe(2);

      const res = await request(app).delete(
        `/api/skills/${created.body._id}/files/scripts%2Fparse.sh`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        skillId: created.body._id,
        relativePath: 'scripts/parse.sh',
        deleted: true,
      });

      const afterSkill = await request(app).get(`/api/skills/${created.body._id}`);
      expect(afterSkill.body.fileCount).toBe(0);
      expect(afterSkill.body.version).toBe(3);
    });

    it('returns 404 when the file does not exist', async () => {
      const created = await createSkillAsOwner();
      const res = await request(app).delete(
        `/api/skills/${created.body._id}/files/scripts%2Fmissing.sh`,
      );
      expect(res.status).toBe(404);
    });

    it('returns 403 for a non-owner', async () => {
      const created = await createSkillAsOwner();
      setTestUser(testUsers.noAccess);
      const res = await request(app).delete(
        `/api/skills/${created.body._id}/files/scripts%2Fparse.sh`,
      );
      expect(res.status).toBe(403);
    });
  });

  describe('Sharing via ACL (editor grant)', () => {
    it('allows an editor to patch a shared skill', async () => {
      const created = await createSkillAsOwner();
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: testUsers.editor._id,
        resourceType: ResourceType.SKILL,
        resourceId: created.body._id,
        accessRoleId: AccessRoleIds.SKILL_EDITOR,
        grantedBy: testUsers.owner._id,
      });

      setTestUser(testUsers.editor);
      const res = await request(app)
        .patch(`/api/skills/${created.body._id}`)
        .send({ expectedVersion: 1, description: 'Edited by editor' });
      expect(res.status).toBe(200);

      // Editor should NOT be able to delete
      const del = await request(app).delete(`/api/skills/${created.body._id}`);
      expect(del.status).toBe(403);
    });
  });
});
