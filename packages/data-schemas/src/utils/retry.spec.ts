import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Model } from 'mongoose';
import type { IAgentTriggerDeliveryDocument } from '~/types/triggerDelivery';
import triggerDeliverySchema from '~/schema/triggerDelivery';
import { createIndexesWithRetry } from './retry';

const DB_SETUP_TIMEOUT_MS = 60_000;
/** Amazon DocumentDB: "Existing index build in progress on the same collection." */
const INDEX_BUILD_ALREADY_IN_PROGRESS = 40333;
const BUILD_LATENCY_MS = 5;

let mongoServer: MongoMemoryServer;
let modelCounter = 0;

function indexBuildInProgressError(): Error {
  return new mongoose.mongo.MongoServerError({
    ok: 0,
    code: INDEX_BUILD_ALREADY_IN_PROGRESS,
    errmsg:
      'Existing index build in progress on the same collection. Collection is limited to a single index build at a time.',
  });
}

/**
 * Turns the in-memory MongoDB into a single-index-build engine: a createIndex that
 * arrives while another build on the same collection is in flight is rejected the
 * way DocumentDB rejects it, instead of being serialized the way MongoDB does.
 */
function enforceSingleIndexBuild(model: Model<IAgentTriggerDeliveryDocument>): {
  rejected: () => number;
} {
  const collection = model.collection;
  const createIndex = collection.createIndex.bind(collection);
  let inFlight = 0;
  let rejected = 0;
  collection.createIndex = async (fields, options) => {
    if (inFlight > 0) {
      rejected += 1;
      throw indexBuildInProgressError();
    }
    inFlight += 1;
    try {
      await new Promise((resolve) => setTimeout(resolve, BUILD_LATENCY_MS));
      return await createIndex(fields, options);
    } finally {
      inFlight -= 1;
    }
  };
  return { rejected: () => rejected };
}

function compileDeliveryModel(): Model<IAgentTriggerDeliveryDocument> {
  modelCounter += 1;
  return mongoose.model<IAgentTriggerDeliveryDocument>(
    `RetrySpecDelivery${modelCounter}`,
    triggerDeliverySchema,
    `retry_spec_deliveries_${modelCounter}`,
  );
}

async function indexNames(model: Model<IAgentTriggerDeliveryDocument>): Promise<Set<string>> {
  const indexes = await model.listIndexes();
  return new Set(indexes.map((index) => index.name));
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}, DB_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
}, DB_SETUP_TIMEOUT_MS);

describe('createIndexesWithRetry on a single-index-build engine', () => {
  test('waits for the automatic build Mongoose starts at compile before building explicitly', async () => {
    const model = compileDeliveryModel();
    const automaticBuildStarted = new Promise<void>((resolve) => {
      model.once('index-single-start', () => resolve());
    });
    const engine = enforceSingleIndexBuild(model);
    await automaticBuildStarted;

    await createIndexesWithRetry(model, { baseDelayMs: 1, jitter: false });

    await expect(model.init()).resolves.toBeUndefined();
    const names = await indexNames(model);
    expect(names.size).toBe(triggerDeliverySchema.indexes().length + 1);
    expect(names.has('deliveryKey_1')).toBe(true);
    expect(engine.rejected()).toBe(0);
  });

  test('keeps polling while another replica holds the collection, then builds', async () => {
    const model = compileDeliveryModel();
    await model.init();
    const collection = model.collection;
    const createIndex = collection.createIndex.bind(collection);
    let remainingRejections = 6;
    let attempts = 0;
    collection.createIndex = async (fields, options) => {
      attempts += 1;
      if (remainingRejections > 0) {
        remainingRejections -= 1;
        throw indexBuildInProgressError();
      }
      return createIndex(fields, options);
    };

    await createIndexesWithRetry(model, { maxAttempts: 1, peerBuildPollMs: 1 });

    expect(remainingRejections).toBe(0);
    expect(attempts).toBeGreaterThan(6);
    expect((await indexNames(model)).has('deliveryKey_1')).toBe(true);
  });

  test('surfaces the conflict once the peer-build deadline passes', async () => {
    const model = compileDeliveryModel();
    await model.init();
    let attempts = 0;
    model.collection.createIndex = async () => {
      attempts += 1;
      throw indexBuildInProgressError();
    };

    await expect(
      createIndexesWithRetry(model, {
        maxAttempts: 1,
        peerBuildPollMs: 1,
        peerBuildDeadlineMs: 20,
      }),
    ).rejects.toMatchObject({ code: INDEX_BUILD_ALREADY_IN_PROGRESS });
    expect(attempts).toBeGreaterThan(triggerDeliverySchema.indexes().length);
  });

  test('still fails fast on errors that are not transient', async () => {
    const model = compileDeliveryModel();
    await model.init();
    const collection = model.collection;
    let attempts = 0;
    collection.createIndex = async () => {
      attempts += 1;
      throw new mongoose.mongo.MongoServerError({
        ok: 0,
        code: 67,
        errmsg: 'CannotCreateIndex: bad index spec',
      });
    };

    await expect(createIndexesWithRetry(model, { baseDelayMs: 1, jitter: false })).rejects.toThrow(
      'bad index spec',
    );
    expect(attempts).toBe(triggerDeliverySchema.indexes().length);
  });
});
