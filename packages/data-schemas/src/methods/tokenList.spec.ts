import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createTokenListMethods } from './tokenList';
import { createTokenModel } from '~/models/token';
import { createTokenMethods } from './token';

let mongoServer: MongoMemoryServer;
let methods: ReturnType<typeof createTokenListMethods>;
let tokens: ReturnType<typeof createTokenMethods>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createTokenModel(mongoose);
  methods = createTokenListMethods(mongoose);
  tokens = createTokenMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

const add = (userId: mongoose.Types.ObjectId, type: string, identifier: string) =>
  tokens.createToken({ userId, type, identifier, token: `${type}:${identifier}`, expiresIn: 60 });

describe('findTokensOfUser', () => {
  it("returns every token of one type the user holds, and only that user's", async () => {
    const user = new mongoose.Types.ObjectId();
    const other = new mongoose.Types.ObjectId();
    await add(user, 'pr_oauth', 'github:github.com');
    await add(user, 'pr_oauth', 'gitlab:gitlab.com');
    await add(user, 'mcp_oauth', 'server');
    await add(other, 'pr_oauth', 'github:github.com');
    const found = await methods.findTokensOfUser({ userId: user.toString(), type: 'pr_oauth' });
    expect(found.map((token) => token.identifier).sort()).toEqual([
      'github:github.com',
      'gitlab:gitlab.com',
    ]);
  });

  it('returns nothing for a user without any', async () => {
    const found = await methods.findTokensOfUser({
      userId: new mongoose.Types.ObjectId().toString(),
      type: 'pr_oauth',
    });
    expect(found).toEqual([]);
  });
});
