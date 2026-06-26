import fs from 'fs';
import path from 'path';
import { MongoClient } from 'mongodb';
import type { Db } from 'mongodb';

const DEFAULT_MONGO_URI = 'mongodb://127.0.0.1:27017/LibreChat-e2e';
/** Written by e2e/setup/start-server.js on boot; authoritative even for memory MongoDB. */
const RUNTIME_ENV_PATH = path.resolve(__dirname, '../.test-results/runtime-env.json');

function getMongoUri(): string {
  try {
    const env = JSON.parse(fs.readFileSync(RUNTIME_ENV_PATH, 'utf8')) as { MONGO_URI?: string };
    if (env.MONGO_URI) {
      return env.MONGO_URI;
    }
  } catch {
    /* fall through to env/default */
  }
  return process.env.MONGO_URI ?? DEFAULT_MONGO_URI;
}

/** Connect to the e2e MongoDB, run `fn`, and always close the client. */
export async function withMongo<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = new MongoClient(getMongoUri());
  await client.connect();
  try {
    return await fn(client.db());
  } finally {
    await client.close();
  }
}

export interface SeedConvo {
  conversationId: string;
  title: string;
  /** Drives the sidebar date group ("Today", "Previous 7 days", ...). */
  updatedAt: Date;
}

/**
 * Inserts conversation documents directly (bypassing mongoose timestamps) so their
 * `updatedAt` can be backdated into specific sidebar date groups.
 */
export async function seedConversations(userEmail: string, convos: SeedConvo[]): Promise<void> {
  await withMongo(async (db) => {
    const user = await db.collection('users').findOne({ email: userEmail });
    if (!user) {
      throw new Error(`E2E seed: user "${userEmail}" not found`);
    }
    const userId = user._id.toString();
    const docs = convos.map((convo) => ({
      conversationId: convo.conversationId,
      title: convo.title,
      user: userId,
      endpoint: 'openAI',
      isArchived: false,
      createdAt: convo.updatedAt,
      updatedAt: convo.updatedAt,
      __v: 0,
    }));
    await db.collection('conversations').insertMany(docs);
  });
}

export async function deleteConversations(conversationIds: string[]): Promise<void> {
  await withMongo(async (db) => {
    await db.collection('conversations').deleteMany({ conversationId: { $in: conversationIds } });
  });
}
