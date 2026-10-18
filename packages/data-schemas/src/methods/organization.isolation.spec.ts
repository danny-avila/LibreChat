import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { SystemRoles, OrganizationMemberStatus } from 'librechat-data-provider';
import type * as t from '~/types';
import { _resetStrictCache } from '~/models/plugins/tenantIsolation';
import { runInAccounts, runInTenant } from '~/config/tenantContext';
import { generateOrganizationTenantId } from './organization';
import { createModels } from '~/models';
import { createMethods } from './index';

/**
 * One person in two organizations: whatever they create in one must be invisible from the
 * other — read through the member the other organization knows them as, through the first
 * member's own ids, and from the login account behind both.
 */

let mongoServer: MongoMemoryServer;
let methods: ReturnType<typeof createMethods>;
const originalStrict = process.env.TENANT_ISOLATION_STRICT;

const orgA = generateOrganizationTenantId();
const orgB = generateOrganizationTenantId();
let account: t.IUser;
let memberA: t.IUser;
let memberB: t.IUser;

const seeded = {
  conversationId: randomUUID(),
  messageId: randomUUID(),
  fileId: randomUUID(),
  agentId: `agent_${randomUUID()}`,
  presetId: randomUUID(),
  shareId: randomUUID(),
  promptGroupId: new mongoose.Types.ObjectId(),
  documentIds: {} as Record<string, mongoose.Types.ObjectId>,
};

const model = (name: string) => mongoose.models[name];

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  methods = createMethods(mongoose);

  /* From here on, every read and write must name its tenant: unscoped access throws. */
  process.env.TENANT_ISOLATION_STRICT = 'true';
  _resetStrictCache();

  account = await runInAccounts(
    async () =>
      (await methods.createUser(
        { email: 'alice@example.com', name: 'Alice', username: 'alice', provider: 'local' },
        undefined,
        true,
        true,
      )) as t.IUser,
  );
  for (const [tenantId, name] of [
    [orgA, 'Acme'],
    [orgB, 'Beta'],
  ]) {
    await methods.createOrganization({ tenantId, name, createdBy: account._id });
  }
  memberA = (await methods.createMembership({ tenantId: orgA, account, role: SystemRoles.ADMIN }))
    .member;
  memberB = (await methods.createMembership({ tenantId: orgB, account, role: SystemRoles.USER }))
    .member;

  await runInTenant(orgA, async () => {
    const user = memberA._id.toString();
    const created = await Promise.all([
      model('Conversation').create({
        conversationId: seeded.conversationId,
        user,
        title: 'Acme roadmap',
        endpoint: 'openAI',
      }),
      model('Message').create({
        messageId: seeded.messageId,
        conversationId: seeded.conversationId,
        user,
        text: 'Acme launch date',
        isCreatedByUser: true,
      }),
      model('File').create({
        file_id: seeded.fileId,
        user: memberA._id,
        bytes: 1,
        filename: 'plan.pdf',
        filepath: '/uploads/plan.pdf',
        object: 'file',
        type: 'application/pdf',
        usage: 0,
      }),
      model('Agent').create({
        id: seeded.agentId,
        name: 'Acme agent',
        provider: 'openAI',
        model: 'gpt-4o',
        author: memberA._id,
      }),
      model('Preset').create({
        presetId: seeded.presetId,
        user,
        title: 'Acme preset',
        endpoint: 'openAI',
      }),
      model('MemoryEntry').create({
        userId: memberA._id,
        key: 'roadmap',
        value: 'Acme launch date',
        tokenCount: 1,
      }),
      model('ConversationTag').create({ user, tag: 'acme', position: 0 }),
      model('SharedLink').create({
        conversationId: seeded.conversationId,
        user,
        shareId: seeded.shareId,
        isPublic: true,
      }),
      model('PromptGroup').create({
        _id: seeded.promptGroupId,
        name: 'Acme prompts',
        author: memberA._id,
        authorName: 'Alice',
        productionId: new mongoose.Types.ObjectId(),
      }),
    ]);
    for (const document of created) {
      seeded.documentIds[(document.constructor as mongoose.Model<unknown>).modelName] =
        document._id as mongoose.Types.ObjectId;
    }
  });
});

afterAll(async () => {
  if (originalStrict === undefined) {
    delete process.env.TENANT_ISOLATION_STRICT;
  } else {
    process.env.TENANT_ISOLATION_STRICT = originalStrict;
  }
  _resetStrictCache();
  await mongoose.disconnect();
  await mongoServer.stop();
});

type Read = (userId: string) => Promise<unknown>;

/** Every read an organization member's requests make over the data seeded above. */
const reads: Record<string, Read> = {
  conversation: (user) => methods.getConvo(user, seeded.conversationId),
  conversations: async (user) => (await methods.getConvosByCursor(user, {})).conversations,
  messages: () => methods.getMessages({ conversationId: seeded.conversationId }),
  files: (user) => methods.getFiles({ user }),
  fileById: () => methods.findFileById(seeded.fileId),
  agents: (user) => methods.getAgents({ author: user }),
  agentById: () => methods.getAgents({ id: seeded.agentId }),
  presets: (user) => methods.getPresets(user),
  memories: (user) => methods.getAllUserMemories(user),
  tags: (user) => methods.getConversationTags(user),
  sharedLink: (user) => methods.getSharedLink(user, seeded.conversationId),
  sharedLinks: async (user) => (await methods.getSharedLinks(user)).links,
  promptGroup: () => methods.getPromptGroup({ _id: seeded.promptGroupId.toString() }),
};

function isFound(result: unknown): boolean {
  if (Array.isArray(result)) {
    return result.length > 0;
  }
  if (result && typeof result === 'object' && 'success' in result) {
    return result.success === true;
  }
  return result != null;
}

async function visibility(run: <T>(op: () => Promise<T>) => Promise<T>, userId: string) {
  const seen: Record<string, boolean> = {};
  for (const [name, read] of Object.entries(reads)) {
    seen[name] = isFound(await run(() => read(userId)));
  }
  return seen;
}

const everything = (value: boolean) =>
  Object.fromEntries(Object.keys(reads).map((name) => [name, value]));

describe('one account in two organizations', () => {
  it('is a distinct member in each, both tied to the one login account', () => {
    expect(memberA._id.toString()).not.toBe(memberB._id.toString());
    expect(memberA.tenantId).toBe(orgA);
    expect(memberB.tenantId).toBe(orgB);
    expect(memberA.identityId?.toString()).toBe(account._id.toString());
    expect(memberB.identityId?.toString()).toBe(account._id.toString());
  });

  it('sees all of its data inside the organization that owns it', async () => {
    const inA = <T>(op: () => Promise<T>) => runInTenant(orgA, op);
    await expect(visibility(inA, memberA._id.toString())).resolves.toEqual(everything(true));
  });

  it('sees none of it from the other organization, as its member there', async () => {
    const inB = <T>(op: () => Promise<T>) => runInTenant(orgB, op);
    await expect(visibility(inB, memberB._id.toString())).resolves.toEqual(everything(false));
  });

  it('sees none of it from the other organization even with the first member’s ids', async () => {
    const inB = <T>(op: () => Promise<T>) => runInTenant(orgB, op);
    await expect(visibility(inB, memberA._id.toString())).resolves.toEqual(everything(false));
  });

  it('sees none of it from the login account', async () => {
    const asAccount = <T>(op: () => Promise<T>) => runInAccounts(op);
    await expect(visibility(asAccount, account._id.toString())).resolves.toEqual(everything(false));
    await expect(visibility(asAccount, memberA._id.toString())).resolves.toEqual(everything(false));
  });

  it('cannot read, change or delete the other organization’s records by document id', async () => {
    const names = Object.keys(seeded.documentIds);
    expect(names).toHaveLength(9);

    await runInTenant(orgB, async () => {
      for (const name of names) {
        const _id = seeded.documentIds[name];
        await expect(model(name).findById(_id).lean()).resolves.toBeNull();
        /* A field no schema declares, so the write is never dropped as empty before it runs. */
        const updated = await model(name).updateOne(
          { _id },
          { $set: { isolationProbe: true } },
          { strict: false },
        );
        expect(updated.matchedCount).toBe(0);
        const deleted = await model(name).deleteMany({ _id });
        expect(deleted.deletedCount).toBe(0);
      }
    });

    /* The same probe matches inside the owning organization, so the zeros above are isolation. */
    await runInTenant(orgA, async () => {
      for (const name of names) {
        const _id = seeded.documentIds[name];
        await expect(model(name).findById(_id).lean()).resolves.not.toBeNull();
        const updated = await model(name).updateOne(
          { _id },
          { $set: { isolationProbe: true } },
          { strict: false },
        );
        expect(updated.matchedCount).toBe(1);
      }
    });
  });

  it('lets people search find only the active members of the current organization', async () => {
    const join = async (email: string, name: string) => {
      const person = await runInAccounts(
        async () =>
          (await methods.createUser(
            { email, name, username: name.toLowerCase(), provider: 'local' },
            undefined,
            true,
            true,
          )) as t.IUser,
      );
      return (await methods.createMembership({ tenantId: orgA, account: person, role: 'USER' }))
        .member;
    };
    await join('carol@example.com', 'Carol');
    const dave = await join('dave@example.com', 'Dave');
    await runInTenant(orgA, () =>
      methods.updateOrganizationMember(dave._id.toString(), {
        status: OrganizationMemberStatus.DEACTIVATED,
      }),
    );

    const names = async (tenantId: string, pattern: string) =>
      runInTenant(tenantId, async () => {
        const [users, principals] = await Promise.all([
          methods.searchUsers({ searchPattern: pattern }),
          methods.searchPrincipals(pattern),
        ]);
        return [...users.map((user) => user.name), ...principals.map((p) => p.name)];
      });

    await expect(names(orgA, 'carol')).resolves.toEqual(['Carol', 'Carol']);
    await expect(names(orgA, 'dave')).resolves.toEqual([]);
    await expect(names(orgB, 'carol')).resolves.toEqual([]);
  });
});
