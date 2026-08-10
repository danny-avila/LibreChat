import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMCPAuthorityProofCollections } from './mcpAuthorityCollections';
import { MCP_AUTHORITY_PROOF_COLLECTIONS } from '../methods/mcpAuthority';

let mongoServer: InstanceType<typeof MongoMemoryServer>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), { autoCreate: false });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

test('creates every MCP proof collection idempotently with autoCreate disabled', async () => {
  await expect(createMCPAuthorityProofCollections(mongoose.connection)).resolves.toEqual(
    MCP_AUTHORITY_PROOF_COLLECTIONS,
  );
  await expect(createMCPAuthorityProofCollections(mongoose.connection)).resolves.toEqual(
    MCP_AUTHORITY_PROOF_COLLECTIONS,
  );

  const collections = await mongoose.connection
    .db!.listCollections({}, { nameOnly: true })
    .toArray();
  expect(collections.map(({ name }) => name).sort()).toEqual(
    [...MCP_AUTHORITY_PROOF_COLLECTIONS].sort(),
  );
});
