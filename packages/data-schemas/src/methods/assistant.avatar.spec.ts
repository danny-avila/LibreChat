import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { IAssistant } from '~/types';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import { runAsSystem, tenantStorage } from '~/config/tenantContext';
import { createAssistantMethods } from './assistant';
import assistantSchema from '~/schema/assistant';

const schema = assistantSchema.clone();
applyTenantIsolation(schema);
const Assistant = mongoose.model<IAssistant>('Assistant', schema);
const methods = createAssistantMethods(mongoose);
const ownerId = new mongoose.Types.ObjectId();
const attackerId = new mongoose.Types.ObjectId();
const originalAvatar = { filepath: '/images/original.png', source: 'local' };
const avatar = { filepath: '/images/replacement.png', source: 'local' };
let mongoServer: MongoMemoryServer;

const updateAvatar = (query: Parameters<typeof methods.updateAssistantAvatar>[0]) =>
  tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
    methods.updateAssistantAvatar(query, avatar),
  );

const readAssistant = (assistantId = 'victim-assistant') =>
  runAsSystem(async () => Assistant.findOne({ assistant_id: assistantId }).lean<IAssistant>());

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({ instance: { args: ['--nounixsocket'] } });
  await mongoose.connect(mongoServer.getUri());
  await Assistant.init();
});

beforeEach(async () => {
  await runAsSystem(async () => {
    await Assistant.deleteMany({});
    await Assistant.create([
      {
        assistant_id: 'victim-assistant',
        user: ownerId,
        endpoint: 'openAI',
        avatar: originalAvatar,
        tenantId: 'tenant-a',
      },
      {
        assistant_id: 'attacker-assistant',
        user: attackerId,
        endpoint: 'azureOpenAI',
        avatar: originalAvatar,
        tenantId: 'tenant-a',
      },
    ]);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await mongoose.disconnect();
  mongoose.deleteModel('Assistant');
  await mongoServer?.stop();
});

describe('updateAssistantAvatar', () => {
  it("cannot update another user's assistant or claim its ownership", async () => {
    const result = await updateAvatar({
      assistantId: 'victim-assistant',
      user: attackerId.toString(),
    });

    expect(result).toBeNull();
    expect(await readAssistant()).toMatchObject({
      user: ownerId,
      endpoint: 'openAI',
      avatar: originalAvatar,
    });
    expect(await readAssistant('attacker-assistant')).toMatchObject({
      user: attackerId,
      endpoint: 'azureOpenAI',
      avatar: originalAvatar,
    });
    expect(await runAsSystem(async () => Assistant.countDocuments())).toBe(2);
  });

  it("updates the correct owner's avatar without changing ownership or endpoint", async () => {
    const result = await updateAvatar({
      assistantId: 'victim-assistant',
      user: ownerId.toString(),
    });

    expect(result).toMatchObject({
      assistant_id: 'victim-assistant',
      user: ownerId,
      endpoint: 'openAI',
      avatar,
    });
    expect(await readAssistant()).toMatchObject({ user: ownerId, endpoint: 'openAI', avatar });
    expect(await readAssistant('attacker-assistant')).toMatchObject({ avatar: originalAvatar });
  });

  it('allows a manager selector without user while preserving the original owner and endpoint', async () => {
    const result = await updateAvatar({ assistantId: 'victim-assistant' });

    expect(result).toMatchObject({ user: ownerId, endpoint: 'openAI', avatar });
    expect(await readAssistant()).toMatchObject({ user: ownerId, endpoint: 'openAI', avatar });
  });

  it('returns null for an unknown assistant without inserting a document', async () => {
    const result = await updateAvatar({
      assistantId: 'missing-assistant',
      user: ownerId.toString(),
    });

    expect(result).toBeNull();
    expect(await readAssistant('missing-assistant')).toBeNull();
    expect(await runAsSystem(async () => Assistant.countDocuments())).toBe(2);
  });

  it.each<{ query: unknown }>([
    { query: undefined },
    { query: null },
    { query: {} },
    { query: { assistantId: undefined } },
    { query: { assistantId: null } },
    { query: { assistantId: '' } },
    { query: { assistantId: ' \t\n ' } },
    { query: { assistantId: false } },
    { query: { assistantId: 42 } },
    { query: { assistantId: [] } },
    { query: { assistantId: ['victim-assistant'] } },
    { query: { assistantId: { $ne: null } } },
    { query: Object.setPrototypeOf({}, { assistantId: 'victim-assistant' }) },
  ])('rejects invalid assistant selectors before querying: $query', async ({ query }) => {
    const findOneAndUpdate = jest.spyOn(Assistant, 'findOneAndUpdate');

    // @ts-expect-error JavaScript callers can supply invalid selectors at runtime.
    await expect(updateAvatar(query)).rejects.toThrow('assistantId must be a nonempty string');

    expect(findOneAndUpdate).not.toHaveBeenCalled();
    expect(await readAssistant()).toMatchObject({ avatar: originalAvatar });
  });

  it.each([
    { user: null },
    { user: '' },
    { user: ' \t\n ' },
    { user: false },
    { user: 42 },
    { user: [] },
    { user: [ownerId.toString()] },
    { user: { $ne: null } },
  ])('rejects invalid owner selectors before querying: $user', async ({ user }) => {
    const findOneAndUpdate = jest.spyOn(Assistant, 'findOneAndUpdate');

    // @ts-expect-error JavaScript callers can supply invalid owner selectors at runtime.
    await expect(updateAvatar({ assistantId: 'victim-assistant', user })).rejects.toThrow(
      'user must be a nonempty string',
    );

    expect(findOneAndUpdate).not.toHaveBeenCalled();
    expect(await readAssistant()).toMatchObject({ user: ownerId, avatar: originalAvatar });
  });

  it('rejects inherited owner selectors before querying', async () => {
    const findOneAndUpdate = jest.spyOn(Assistant, 'findOneAndUpdate');
    const query = Object.setPrototypeOf(
      { assistantId: 'victim-assistant' },
      { user: attackerId.toString() },
    );

    await expect(updateAvatar(query)).rejects.toThrow('user must be a nonempty string');

    expect(findOneAndUpdate).not.toHaveBeenCalled();
    expect(await readAssistant()).toMatchObject({ user: ownerId, avatar: originalAvatar });
  });

  it("cannot update another tenant's assistant when user is omitted", async () => {
    await tenantStorage.run({ tenantId: 'tenant-b' }, async () =>
      Assistant.create({
        assistant_id: 'foreign-assistant',
        user: ownerId,
        endpoint: 'azureOpenAI',
        avatar: originalAvatar,
      }),
    );

    expect(await updateAvatar({ assistantId: 'foreign-assistant' })).toBeNull();
    expect(await readAssistant('foreign-assistant')).toMatchObject({
      user: ownerId,
      endpoint: 'azureOpenAI',
      avatar: originalAvatar,
      tenantId: 'tenant-b',
    });
  });

  it('updates only the active tenant when assistant identifiers overlap', async () => {
    await tenantStorage.run({ tenantId: 'tenant-b' }, async () =>
      Assistant.create({
        assistant_id: 'victim-assistant',
        user: attackerId,
        endpoint: 'azureOpenAI',
        avatar: originalAvatar,
      }),
    );

    expect(await updateAvatar({ assistantId: 'victim-assistant' })).toMatchObject({
      user: ownerId,
      endpoint: 'openAI',
      avatar,
      tenantId: 'tenant-a',
    });
    const foreignAssistant = await tenantStorage.run({ tenantId: 'tenant-b' }, async () =>
      Assistant.findOne({ assistant_id: 'victim-assistant' }).lean<IAssistant>(),
    );
    expect(foreignAssistant).toMatchObject({
      user: attackerId,
      endpoint: 'azureOpenAI',
      avatar: originalAvatar,
      tenantId: 'tenant-b',
    });
  });
});
