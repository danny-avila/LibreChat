import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels } from '@librechat/data-schemas';
import type { FileProvisionCommit, IMongoFile } from '@librechat/data-schemas';
import { createFileProvisionRecovery, withFileProvisioning } from './operations';

let mongo: MongoMemoryServer;
let File: mongoose.Model<IMongoFile>;
let methods: ReturnType<typeof createMethods>;
const owner = new mongoose.Types.ObjectId();
const scope = { file_id: 'recovery-file', userId: owner.toString(), tenantId: 'tenant' };
const file = { file_id: scope.file_id, user: owner, tenantId: scope.tenantId };
const ref = {
  kind: 'user' as const,
  id: scope.userId,
  storage_session_id: 'session',
  file_id: 'remote',
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  createModels(mongoose);
  await mongoose.connect(mongo.getUri());
  File = mongoose.models.File as mongoose.Model<IMongoFile>;
  methods = createMethods(mongoose);
}, 30_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await File.deleteMany({});
  await File.create({
    ...file,
    filename: 'notes.txt',
    filepath: '/uploads/notes.txt',
    type: 'text/plain',
    bytes: 1,
    source: 'local',
  });
});

it('recovers the original remote result and claim after the database becomes available', async () => {
  const storage = { ...methods, recovery: createFileProvisionRecovery() };
  const commit = jest
    .spyOn(storage, 'commitFileProvision')
    .mockRejectedValueOnce(new Error('database unavailable'))
    .mockRejectedValueOnce(new Error('database unavailable'));
  const upload = jest.fn(async () => ({
    value: ref,
    commit: { code: { routeKey: 'default', ref } },
  }));
  const options = {
    file,
    userId: scope.userId,
    storage,
    destination: 'code:default:notes.txt',
    operation: upload,
  };
  await expect(withFileProvisioning(options)).rejects.toThrow('persistence was not confirmed');
  const pending = await File.findOne({ file_id: file.file_id }).lean();
  const token = pending?.storageOperations?.provisioning?.[0];
  expect(token).toEqual(expect.any(String));

  expect(await withFileProvisioning({ ...options, storage: { ...storage } })).toBe(ref);
  expect(upload).toHaveBeenCalledTimes(1);
  expect(commit).toHaveBeenCalledTimes(3);
  expect(commit).toHaveBeenLastCalledWith(
    expect.objectContaining({ claim: expect.objectContaining({ token }) }),
  );
  const stored = await File.findOne({ file_id: file.file_id }).lean();
  expect(stored?.metadata?.codeEnvRefs?.default).toEqual(ref);
  expect(stored?.storageOperations?.provisioning).toEqual([]);
  expect(
    await methods.acquireFileDeletion({
      ...scope,
      updatedAt: stored?.updatedAt,
      token: 'deletion',
    }),
  ).toEqual({ resumed: false });
});

it('reconciles a lost acquisition acknowledgment without abandoning its applied token', async () => {
  const storage = { ...methods, recovery: createFileProvisionRecovery() };
  const acquire = jest
    .spyOn(storage, 'acquireFileProvision')
    .mockImplementationOnce(async (claim) => {
      await methods.acquireFileProvision(claim);
      throw new Error('acquisition acknowledgment lost');
    });
  const release = jest.spyOn(storage, 'releaseFileProvision');
  const operation = jest.fn(async () => ({
    value: ref,
    commit: { code: { routeKey: 'default', ref } },
  }));
  const options = { file, userId: scope.userId, storage, destination: 'code', operation };
  await expect(withFileProvisioning(options)).rejects.toThrow();
  expect(operation).not.toHaveBeenCalled();
  const original = acquire.mock.calls[0][0];
  expect(
    (await File.findOne({ file_id: file.file_id }).lean())?.storageOperations?.provisioning,
  ).toEqual([original.token]);
  await expect(withFileProvisioning(options)).resolves.toBe(ref);
  expect(operation).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledWith(original);
  const stored = await File.findOne({ file_id: file.file_id }).lean();
  expect(stored?.storageOperations?.provisioning).toEqual([]);
  expect(
    await methods.acquireFileDeletion({ ...scope, updatedAt: stored?.updatedAt, token: 'delete' }),
  ).toEqual({ resumed: false });
});

it('retries release only after a lost acknowledgment without overwriting a later pointer', async () => {
  const storage = { ...methods, recovery: createFileProvisionRecovery() };
  const release = jest
    .spyOn(storage, 'releaseFileProvision')
    .mockImplementationOnce(async (claim) => {
      await methods.releaseFileProvision(claim);
      throw new Error('release acknowledgment lost');
    });
  const commit = jest.spyOn(storage, 'commitFileProvision');
  const operation = jest.fn(async () => ({
    value: ref,
    commit: { code: { routeKey: 'default', ref } },
  }));
  const options = {
    file,
    userId: scope.userId,
    storage,
    destination: 'code:default:notes.txt',
    operation,
  };
  await expect(withFileProvisioning(options)).rejects.toThrow('persistence was not confirmed');

  const peer = { ...scope, token: 'peer' };
  const replacement: FileProvisionCommit = {
    claim: peer,
    code: { routeKey: 'default', ref: { ...ref, file_id: 'replacement' } },
  };
  expect(await methods.acquireFileProvision(peer)).toBe(true);
  expect(await methods.commitFileProvision(replacement)).toBe(true);
  expect(await methods.releaseFileProvision(peer)).toBe(true);
  expect(await withFileProvisioning(options)).toBe(ref);
  expect(operation).toHaveBeenCalledTimes(1);
  expect(commit).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledTimes(2);
  const stored = await File.findOne({ file_id: file.file_id }).lean();
  expect(stored?.metadata?.codeEnvRefs?.default?.file_id).toBe('replacement');
  expect(stored?.storageOperations?.provisioning).toEqual([]);
});
