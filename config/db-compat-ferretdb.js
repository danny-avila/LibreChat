#!/usr/bin/env node

require('dotenv').config();

const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const {
  createModels,
  createMethods,
  runAsSystem,
  supportsTransactions,
  tenantStorage,
} = require('@librechat/data-schemas');
const {
  FileContext,
  FileSources,
  PrincipalModel,
  PrincipalType,
  ResourceType,
} = require('librechat-data-provider');

const {
  DB_COMPAT_ALLOW_DROP,
  DB_COMPAT_INDEX_RETRIES = '5',
  DB_COMPAT_TENANT_A = `compat-a-${Date.now()}`,
  DB_COMPAT_TENANT_B = `compat-b-${Date.now()}`,
  MONGO_URI,
  TENANT_ISOLATION_STRICT = 'true',
} = process.env;

process.env.TENANT_ISOLATION_STRICT = TENANT_ISOLATION_STRICT;
process.env.JWT_SECRET ||= 'compat-jwt-secret-compat-jwt-secret';
process.env.JWT_REFRESH_SECRET ||= 'compat-refresh-secret-compat-refresh';

const results = [];

function redact(uri) {
  return uri.replace(/\/\/([^:@/]+):([^@/]+)@/, '//<user>:<password>@');
}

function getDatabaseName(uri) {
  const parsed = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, 'http://'));
  return parsed.pathname.replace(/^\//, '').split('?')[0];
}

function assertSafeTarget() {
  if (!MONGO_URI) {
    throw new Error('MONGO_URI is required');
  }
  const databaseName = getDatabaseName(MONGO_URI);
  if (!databaseName) {
    throw new Error('MONGO_URI must include a database name');
  }
  if (DB_COMPAT_ALLOW_DROP !== 'true') {
    throw new Error('Refusing to run: set DB_COMPAT_ALLOW_DROP=true for a disposable database');
  }
  if (!/(compat|test|ci|tmp|scratch)/i.test(databaseName)) {
    throw new Error(
      `Refusing to drop database "${databaseName}". Use a disposable compat/test database name.`,
    );
  }
  return databaseName;
}

async function record(name, fn) {
  const started = Date.now();
  try {
    results.push({ name, ok: true, ms: Date.now() - started, detail: await fn() });
  } catch (error) {
    results.push({
      name,
      ok: false,
      ms: Date.now() - started,
      error: error?.stack || error?.message || String(error),
    });
  }
}

async function syncIndexesWithRetry(model) {
  const attempts = Number(DB_COMPAT_INDEX_RETRIES) || 5;
  const errors = [];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await model.createCollection();
      await model.syncIndexes();
      return { attempts: attempt, errors };
    } catch (error) {
      errors.push(error?.message || String(error));
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }

  throw new Error(`${model.modelName} syncIndexes failed: ${errors.join(' | ')}`);
}

function objectId() {
  return new mongoose.Types.ObjectId();
}

async function main() {
  const databaseName = assertSafeTarget();
  console.log(`[db:compat:ferretdb] Target ${redact(MONGO_URI)} (${databaseName})`);

  mongoose.set('strictQuery', true);
  await mongoose.connect(MONGO_URI, {
    connectTimeoutMS: 10000,
    serverSelectionTimeoutMS: 10000,
  });

  createModels(mongoose);
  const methods = createMethods(mongoose, {
    findMatchingPattern: () => null,
    getLogStores: () => ({}),
    matchModelName: () => null,
  });

  await record('drop disposable database', async () => {
    await mongoose.connection.db.dropDatabase();
    return { databaseName };
  });

  await record('sync representative LibreChat indexes with retry', async () => {
    const modelNames = [
      'User',
      'Balance',
      'Conversation',
      'Message',
      'File',
      'Config',
      'Session',
      'Token',
      'Key',
      'AccessRole',
      'AclEntry',
      'Transaction',
    ];
    const report = [];
    for (const modelName of modelNames) {
      report.push({ modelName, ...(await syncIndexesWithRetry(mongoose.models[modelName])) });
    }
    return report;
  });

  let userId;
  const conversationId = randomUUID();
  const messageId = randomUUID();

  await record('strict tenant isolation blocks unscoped queries', async () => {
    try {
      await mongoose.models.User.findOne({ email: 'nobody@example.com' }).lean();
    } catch (error) {
      if (String(error.message).includes('tenant context')) {
        return error.message;
      }
      throw error;
    }
    throw new Error('Unscoped query unexpectedly succeeded');
  });

  await record('tenant-aware user uniqueness and balance creation', async () =>
    tenantStorage.run({ tenantId: DB_COMPAT_TENANT_A }, async () => {
      const user = await methods.createUser(
        { email: 'same@example.com', provider: 'local', emailVerified: true },
        { enabled: true, startBalance: 100 },
        true,
        true,
      );
      userId = String(user._id);

      await tenantStorage.run({ tenantId: DB_COMPAT_TENANT_B }, async () =>
        methods.createUser(
          { email: 'same@example.com', provider: 'local', emailVerified: true },
          undefined,
          true,
          true,
        ),
      );

      let duplicateBlocked = false;
      try {
        await methods.createUser(
          { email: 'same@example.com', provider: 'local', emailVerified: true },
          undefined,
          true,
          true,
        );
      } catch (error) {
        duplicateBlocked = /duplicate|E11000/i.test(error.message);
      }

      const balances = await mongoose.models.Balance.find({ user: user._id }).lean();
      if (
        !duplicateBlocked ||
        balances.length !== 1 ||
        balances[0].tenantId !== DB_COMPAT_TENANT_A
      ) {
        throw new Error('Tenant-aware user/balance check failed');
      }
      return { userId, duplicateBlocked, balanceTenant: balances[0].tenantId };
    }),
  );

  await record('message, conversation, and aggregate isolation', async () =>
    tenantStorage.run({ tenantId: DB_COMPAT_TENANT_A }, async () => {
      const msg = await methods.saveMessage(
        { userId },
        {
          conversationId,
          endpoint: 'openAI',
          isCreatedByUser: true,
          messageId,
          sender: 'User',
          text: 'compat message',
        },
        { context: 'db-compat-ferretdb' },
      );
      const convo = await methods.saveConvo(
        { userId },
        { conversationId, endpoint: 'openAI', title: 'Compat Conversation' },
        { context: 'db-compat-ferretdb' },
      );
      const aggregate = await mongoose.models.Message.aggregate([
        { $group: { _id: '$tenantId', count: { $sum: 1 } } },
      ]);

      if (!msg || !convo || aggregate.length !== 1 || aggregate[0]._id !== DB_COMPAT_TENANT_A) {
        throw new Error('Message/conversation tenant isolation failed');
      }
      return { messageId: msg.messageId, conversationId: convo.conversationId, aggregate };
    }),
  );

  await record('bulk save paths inject tenantId', async () =>
    tenantStorage.run({ tenantId: DB_COMPAT_TENANT_A }, async () => {
      const bulkConversationId = randomUUID();
      const bulkMessageId = randomUUID();
      await methods.bulkSaveMessages([
        {
          conversationId: bulkConversationId,
          endpoint: 'openAI',
          isCreatedByUser: true,
          messageId: bulkMessageId,
          sender: 'User',
          text: 'bulk compat message',
          user: userId,
        },
      ]);
      await methods.bulkSaveConvos([
        {
          conversationId: bulkConversationId,
          endpoint: 'openAI',
          title: 'Bulk Compat Conversation',
          user: userId,
        },
      ]);

      const message = await mongoose.models.Message.findOne({ messageId: bulkMessageId }).lean();
      const conversation = await mongoose.models.Conversation.findOne({
        conversationId: bulkConversationId,
      }).lean();

      if (
        message?.tenantId !== DB_COMPAT_TENANT_A ||
        conversation?.tenantId !== DB_COMPAT_TENANT_A
      ) {
        throw new Error('Bulk save tenant injection failed');
      }
      return { messageTenant: message.tenantId, conversationTenant: conversation.tenantId };
    }),
  );

  await record('ACL bulkWrite, distinct, and file/config unique indexes', async () => {
    const resourceId = objectId();

    await tenantStorage.run({ tenantId: DB_COMPAT_TENANT_A }, async () => {
      const role = await mongoose.models.AccessRole.create({
        accessRoleId: 'owner',
        name: 'Owner',
        permBits: 7,
        resourceType: ResourceType.AGENT,
      });
      await methods.bulkWriteAclEntries([
        {
          updateOne: {
            filter: {
              principalId: objectId(),
              principalType: PrincipalType.USER,
              resourceId,
              resourceType: ResourceType.AGENT,
            },
            update: {
              $set: { grantedBy: objectId(), permBits: 7, roleId: role._id },
              $setOnInsert: {
                principalId: objectId(),
                principalModel: PrincipalModel.USER,
                principalType: PrincipalType.USER,
                resourceId,
                resourceType: ResourceType.AGENT,
              },
            },
            upsert: true,
          },
        },
      ]);
    });

    const visible = await tenantStorage.run({ tenantId: DB_COMPAT_TENANT_A }, async () =>
      mongoose.models.AclEntry.find({ resourceId }).distinct('resourceId'),
    );
    const hidden = await tenantStorage.run({ tenantId: DB_COMPAT_TENANT_B }, async () =>
      mongoose.models.AclEntry.find({ resourceId }).distinct('resourceId'),
    );

    const userObjectId = objectId();
    const fileBase = {
      bytes: 1,
      context: FileContext.execute_code,
      conversationId,
      file_id: 'compat-file-a',
      filename: 'same.py',
      filepath: '/tmp/same.py',
      source: FileSources.local,
      type: 'text/x-python',
      user: userObjectId,
    };
    await tenantStorage.run({ tenantId: DB_COMPAT_TENANT_A }, async () =>
      mongoose.models.File.create(fileBase),
    );
    let fileDuplicateBlocked = false;
    try {
      await tenantStorage.run({ tenantId: DB_COMPAT_TENANT_A }, async () =>
        mongoose.models.File.create({ ...fileBase, file_id: 'compat-file-b' }),
      );
    } catch (error) {
      fileDuplicateBlocked = /duplicate|E11000/i.test(error.message);
    }

    const configBase = {
      overrides: { interface: { runCode: false } },
      principalId: 'ADMIN',
      principalModel: PrincipalModel.ROLE,
      principalType: PrincipalType.ROLE,
      priority: 100,
    };
    await tenantStorage.run({ tenantId: DB_COMPAT_TENANT_A }, async () =>
      mongoose.models.Config.create(configBase),
    );
    await tenantStorage.run({ tenantId: DB_COMPAT_TENANT_B }, async () =>
      mongoose.models.Config.create(configBase),
    );

    if (visible.length !== 1 || hidden.length !== 0 || !fileDuplicateBlocked) {
      throw new Error('ACL/file/config compatibility check failed');
    }
    return { visible: visible.length, hidden: hidden.length, fileDuplicateBlocked };
  });

  await record('transaction fallback and insertMany path', async () => {
    const transactionsSupported = await supportsTransactions(mongoose);
    await tenantStorage.run({ tenantId: DB_COMPAT_TENANT_A }, async () =>
      methods.bulkInsertTransactions([
        {
          amount: 5,
          endpoint: 'openAI',
          model: 'gpt-compat',
          rawAmount: 5,
          tokenType: 'prompt',
          user: new mongoose.Types.ObjectId(userId),
        },
      ]),
    );
    const transactionCount = await tenantStorage.run({ tenantId: DB_COMPAT_TENANT_A }, async () =>
      mongoose.models.Transaction.countDocuments({ user: new mongoose.Types.ObjectId(userId) }),
    );
    return { transactionsSupported, transactionCount };
  });

  console.log(JSON.stringify({ results }, null, 2));

  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
