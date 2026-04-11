import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  SystemRoles,
  ResourceType,
  AccessRoleIds,
  PrincipalType,
  PermissionBits,
} from 'librechat-data-provider';
import { createAclEntryMethods } from './aclEntry';
import {
  validateSkillName,
  validateSkillDescription,
  validateRelativePath,
  inferSkillFileCategory,
} from './skill';
import { logger, createModels } from '..';
import { createMethods } from './index';

logger.silent = true;

type LeanUser = {
  _id: mongoose.Types.ObjectId;
  name?: string;
  email: string;
  role?: string;
};

let Skill: mongoose.Model<unknown>;
let SkillFile: mongoose.Model<unknown>;
let AclEntry: mongoose.Model<unknown>;
let AccessRole: mongoose.Model<unknown>;
let User: mongoose.Model<unknown>;
let methods: ReturnType<typeof createMethods>;
let aclMethods: ReturnType<typeof createAclEntryMethods>;
let owner: LeanUser;
let other: LeanUser;

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  createModels(mongoose);
  Skill = mongoose.models.Skill;
  SkillFile = mongoose.models.SkillFile;
  AclEntry = mongoose.models.AclEntry;
  AccessRole = mongoose.models.AccessRole;
  User = mongoose.models.User;

  methods = createMethods(mongoose, {
    removeAllPermissions: async ({ resourceType, resourceId }) => {
      await AclEntry.deleteMany({ resourceType, resourceId });
    },
  });
  aclMethods = createAclEntryMethods(mongoose);

  await AccessRole.create({
    accessRoleId: AccessRoleIds.SKILL_OWNER,
    name: 'Owner',
    description: 'Full control over skills',
    resourceType: ResourceType.SKILL,
    permBits:
      PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.DELETE | PermissionBits.SHARE,
  });
  await AccessRole.create({
    accessRoleId: AccessRoleIds.SKILL_EDITOR,
    name: 'Editor',
    description: 'Can view and edit skills',
    resourceType: ResourceType.SKILL,
    permBits: PermissionBits.VIEW | PermissionBits.EDIT,
  });
  await AccessRole.create({
    accessRoleId: AccessRoleIds.SKILL_VIEWER,
    name: 'Viewer',
    description: 'Can view skills',
    resourceType: ResourceType.SKILL,
    permBits: PermissionBits.VIEW,
  });

  owner = (
    await User.create({
      name: 'Skill Owner',
      email: 'skill-owner@example.com',
      role: SystemRoles.USER,
    })
  ).toObject() as unknown as LeanUser;
  other = (
    await User.create({
      name: 'Other User',
      email: 'skill-other@example.com',
      role: SystemRoles.USER,
    })
  ).toObject() as unknown as LeanUser;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await Skill.deleteMany({});
  await SkillFile.deleteMany({});
  await AclEntry.deleteMany({});
});

async function grantOwner(resourceId: mongoose.Types.ObjectId | string) {
  const role = (await AccessRole.findOne({ accessRoleId: AccessRoleIds.SKILL_OWNER }).lean()) as {
    _id: mongoose.Types.ObjectId;
    permBits: number;
  } | null;
  if (!role) throw new Error('SKILL_OWNER role not seeded');
  return aclMethods.grantPermission(
    PrincipalType.USER,
    owner._id,
    ResourceType.SKILL,
    resourceId,
    role.permBits,
    owner._id,
    undefined,
    role._id,
  );
}

function makeSkillInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'demo-skill',
    description: 'A small demo skill used in tests.',
    body: '# Demo\n\nBody content',
    frontmatter: { name: 'demo-skill', description: 'A small demo skill used in tests.' },
    author: owner._id,
    authorName: owner.name ?? 'Skill Owner',
    ...overrides,
  };
}

describe('skill validation helpers', () => {
  it('rejects reserved names', () => {
    const issues = validateSkillName('anthropic-helper');
    expect(issues.some((i) => i.code === 'RESERVED')).toBe(true);
  });

  it('rejects non-kebab-case names', () => {
    expect(validateSkillName('My Skill').some((i) => i.code === 'INVALID_FORMAT')).toBe(true);
    expect(validateSkillName('UPPER').some((i) => i.code === 'INVALID_FORMAT')).toBe(true);
  });

  it('rejects names longer than 64 chars', () => {
    const long = 'a'.repeat(65);
    expect(validateSkillName(long).some((i) => i.code === 'TOO_LONG')).toBe(true);
  });

  it('accepts valid kebab-case names', () => {
    expect(validateSkillName('my-skill-1')).toEqual([]);
  });

  it('requires description', () => {
    expect(validateSkillDescription('').some((i) => i.code === 'REQUIRED')).toBe(true);
    expect(validateSkillDescription('   ').some((i) => i.code === 'REQUIRED')).toBe(true);
  });

  it('rejects description over 1024 chars', () => {
    expect(validateSkillDescription('x'.repeat(1025)).some((i) => i.code === 'TOO_LONG')).toBe(
      true,
    );
  });

  it('rejects path traversal', () => {
    expect(validateRelativePath('../evil').some((i) => i.code === 'TRAVERSAL')).toBe(true);
    expect(validateRelativePath('scripts/../../etc').some((i) => i.code === 'TRAVERSAL')).toBe(
      true,
    );
  });

  it('rejects absolute paths', () => {
    expect(validateRelativePath('/abs/path').some((i) => i.code === 'ABSOLUTE_PATH')).toBe(true);
  });

  it('rejects SKILL.md explicitly', () => {
    expect(validateRelativePath('SKILL.md').some((i) => i.code === 'RESERVED')).toBe(true);
  });

  it('accepts well-formed relative paths', () => {
    expect(validateRelativePath('scripts/parse.sh')).toEqual([]);
    expect(validateRelativePath('references/schema.md')).toEqual([]);
  });

  it('infers category from top-level prefix', () => {
    expect(inferSkillFileCategory('scripts/parse.sh')).toBe('script');
    expect(inferSkillFileCategory('references/notes.md')).toBe('reference');
    expect(inferSkillFileCategory('assets/image.png')).toBe('asset');
    expect(inferSkillFileCategory('readme.txt')).toBe('other');
  });
});

describe('Skill CRUD methods', () => {
  it('creates a skill with version 1 and default fileCount 0', async () => {
    const skill = await methods.createSkill(makeSkillInput());
    expect(skill.name).toBe('demo-skill');
    expect(skill.version).toBe(1);
    expect(skill.fileCount).toBe(0);
    expect(skill.source).toBe('inline');
    expect(skill.author.toString()).toBe(owner._id.toString());
  });

  it('enforces name uniqueness per author', async () => {
    await methods.createSkill(makeSkillInput());
    await expect(methods.createSkill(makeSkillInput())).rejects.toBeDefined();
  });

  it('throws with validation issues on bad input', async () => {
    await expect(methods.createSkill(makeSkillInput({ name: 'BAD NAME' }))).rejects.toMatchObject({
      code: 'SKILL_VALIDATION_FAILED',
    });
  });

  it('optimistic concurrency — stale version returns conflict with current state', async () => {
    const skill = await methods.createSkill(makeSkillInput());
    const id = skill._id.toString();
    const first = await methods.updateSkill({
      id,
      expectedVersion: 1,
      update: { description: 'First update' },
    });
    expect(first.status).toBe('updated');
    if (first.status === 'updated') {
      expect(first.skill.version).toBe(2);
    }

    const stale = await methods.updateSkill({
      id,
      expectedVersion: 1,
      update: { description: 'Second update' },
    });
    expect(stale.status).toBe('conflict');
    if (stale.status === 'conflict') {
      expect(stale.current.version).toBe(2);
      expect(stale.current.description).toBe('First update');
    }
  });

  it('deleteSkill cascades ACL entries and skill files', async () => {
    const skill = await methods.createSkill(makeSkillInput());
    await grantOwner(skill._id);
    await methods.upsertSkillFile({
      skillId: skill._id,
      relativePath: 'scripts/parse.sh',
      file_id: 'file-123',
      filename: 'parse.sh',
      filepath: '/tmp/parse.sh',
      source: 'local',
      mimeType: 'text/x-shellscript',
      bytes: 42,
      author: owner._id,
    });

    expect(await AclEntry.countDocuments({ resourceId: skill._id })).toBe(1);
    expect(await SkillFile.countDocuments({ skillId: skill._id })).toBe(1);

    const res = await methods.deleteSkill(skill._id.toString());
    expect(res.deleted).toBe(true);
    expect(await AclEntry.countDocuments({ resourceId: skill._id })).toBe(0);
    expect(await SkillFile.countDocuments({ skillId: skill._id })).toBe(0);
  });

  it('listSkillsByAccess returns only accessible skills and paginates by cursor', async () => {
    const skills: Array<Awaited<ReturnType<typeof methods.createSkill>>> = [];
    for (let i = 0; i < 3; i++) {
      const s = await methods.createSkill(
        makeSkillInput({ name: `demo-skill-${i}`, description: `skill ${i}` }),
      );
      skills.push(s);
      await new Promise((r) => setTimeout(r, 5));
    }

    const accessible = skills.map((s) => s._id);
    const page1 = await methods.listSkillsByAccess({ accessibleIds: accessible, limit: 2 });
    expect(page1.skills.length).toBe(2);
    expect(page1.has_more).toBe(true);
    expect(page1.after).not.toBeNull();

    const page2 = await methods.listSkillsByAccess({
      accessibleIds: accessible,
      limit: 2,
      cursor: page1.after,
    });
    expect(page2.skills.length).toBe(1);
    expect(page2.has_more).toBe(false);
  });

  it('listSkillsByAccess filters by category and search', async () => {
    const a = await methods.createSkill(makeSkillInput({ name: 'alpha-skill', category: 'tools' }));
    await methods.createSkill(
      makeSkillInput({ name: 'beta-skill', category: 'other', description: 'beta desc' }),
    );
    const ids = await Skill.find().distinct('_id');

    const byCat = await methods.listSkillsByAccess({
      accessibleIds: ids as unknown as mongoose.Types.ObjectId[],
      limit: 10,
      category: 'tools',
    });
    expect(byCat.skills.length).toBe(1);
    expect(byCat.skills[0].name).toBe(a.name);

    const bySearch = await methods.listSkillsByAccess({
      accessibleIds: ids as unknown as mongoose.Types.ObjectId[],
      limit: 10,
      search: 'beta',
    });
    expect(bySearch.skills.length).toBe(1);
    expect(bySearch.skills[0].name).toBe('beta-skill');
  });
});

describe('SkillFile methods', () => {
  it('upsertSkillFile bumps parent skill version and updates fileCount', async () => {
    const skill = await methods.createSkill(makeSkillInput());
    expect(skill.version).toBe(1);
    expect(skill.fileCount).toBe(0);

    await methods.upsertSkillFile({
      skillId: skill._id,
      relativePath: 'scripts/parse.sh',
      file_id: 'file-abc',
      filename: 'parse.sh',
      filepath: '/tmp/parse.sh',
      source: 'local',
      mimeType: 'text/plain',
      bytes: 10,
      author: owner._id,
    });

    const updated = await methods.getSkillById(skill._id);
    expect(updated?.version).toBe(2);
    expect(updated?.fileCount).toBe(1);
  });

  it('upsertSkillFile replaces an existing row and bumps version again', async () => {
    const skill = await methods.createSkill(makeSkillInput());
    await methods.upsertSkillFile({
      skillId: skill._id,
      relativePath: 'scripts/parse.sh',
      file_id: 'file-1',
      filename: 'parse.sh',
      filepath: '/tmp/v1',
      source: 'local',
      mimeType: 'text/plain',
      bytes: 10,
      author: owner._id,
    });
    await methods.upsertSkillFile({
      skillId: skill._id,
      relativePath: 'scripts/parse.sh',
      file_id: 'file-2',
      filename: 'parse.sh',
      filepath: '/tmp/v2',
      source: 'local',
      mimeType: 'text/plain',
      bytes: 20,
      author: owner._id,
    });
    const after = await methods.getSkillById(skill._id);
    expect(after?.fileCount).toBe(1);
    expect(after?.version).toBe(3);
    const files = await methods.listSkillFiles(skill._id);
    expect(files.length).toBe(1);
    expect(files[0].file_id).toBe('file-2');
  });

  it('deleteSkillFile recounts and bumps version', async () => {
    const skill = await methods.createSkill(makeSkillInput());
    await methods.upsertSkillFile({
      skillId: skill._id,
      relativePath: 'scripts/a.sh',
      file_id: 'f1',
      filename: 'a.sh',
      filepath: '/a',
      source: 'local',
      mimeType: 'text/plain',
      bytes: 1,
      author: owner._id,
    });
    await methods.upsertSkillFile({
      skillId: skill._id,
      relativePath: 'scripts/b.sh',
      file_id: 'f2',
      filename: 'b.sh',
      filepath: '/b',
      source: 'local',
      mimeType: 'text/plain',
      bytes: 1,
      author: owner._id,
    });
    const res = await methods.deleteSkillFile(skill._id, 'scripts/a.sh');
    expect(res.deleted).toBe(true);
    const after = await methods.getSkillById(skill._id);
    expect(after?.fileCount).toBe(1);
    expect(after?.version).toBe(4);
  });

  it('rejects invalid paths via upsertSkillFile', async () => {
    const skill = await methods.createSkill(makeSkillInput());
    await expect(
      methods.upsertSkillFile({
        skillId: skill._id,
        relativePath: '../evil',
        file_id: 'f1',
        filename: 'evil',
        filepath: '/x',
        source: 'local',
        mimeType: 'text/plain',
        bytes: 1,
        author: owner._id,
      }),
    ).rejects.toMatchObject({ code: 'SKILL_FILE_VALIDATION_FAILED' });
  });
});

describe('deleteUserSkills', () => {
  it('removes sole-owned skills only', async () => {
    const mine = await methods.createSkill(makeSkillInput({ name: 'mine' }));
    await grantOwner(mine._id);

    // Create a second skill owned by someone else
    const shared = await Skill.create({
      name: 'shared',
      description: 'shared skill',
      body: '',
      frontmatter: {},
      category: '',
      author: other._id,
      authorName: other.name ?? 'Other',
      version: 1,
      source: 'inline',
      fileCount: 0,
    });
    const sharedId = (shared.toObject() as { _id: mongoose.Types.ObjectId })._id;
    // Owner user has viewer access to shared — so it's NOT sole-owned
    const viewerRole = (await AccessRole.findOne({
      accessRoleId: AccessRoleIds.SKILL_VIEWER,
    }).lean()) as { _id: mongoose.Types.ObjectId; permBits: number } | null;
    await aclMethods.grantPermission(
      PrincipalType.USER,
      owner._id,
      ResourceType.SKILL,
      sharedId,
      viewerRole!.permBits,
      other._id,
      undefined,
      viewerRole!._id,
    );
    // And other is owner of the shared skill
    const ownerRole = (await AccessRole.findOne({
      accessRoleId: AccessRoleIds.SKILL_OWNER,
    }).lean()) as { _id: mongoose.Types.ObjectId; permBits: number } | null;
    await aclMethods.grantPermission(
      PrincipalType.USER,
      other._id,
      ResourceType.SKILL,
      sharedId,
      ownerRole!.permBits,
      other._id,
      undefined,
      ownerRole!._id,
    );

    const deleted = await methods.deleteUserSkills(owner._id as mongoose.Types.ObjectId);
    expect(deleted).toBe(1);
    expect(await Skill.countDocuments()).toBe(1);
    expect(await Skill.countDocuments({ _id: sharedId })).toBe(1);
  });
});
