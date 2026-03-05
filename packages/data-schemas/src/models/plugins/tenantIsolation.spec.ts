import mongoose, { Schema } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { applyTenantIsolation } from './tenantIsolation';
import { tenantStorage, SYSTEM_TENANT_ID } from '~/config/tenantContext';

let mongoServer: InstanceType<typeof MongoMemoryServer>;

interface ITestDoc {
  name: string;
  tenantId?: string;
}

function createTestModel(suffix: string) {
  const schema = new Schema<ITestDoc>({
    name: { type: String, required: true },
    tenantId: { type: String, index: true },
  });
  applyTenantIsolation(schema);
  const modelName = `TestTenant_${suffix}_${Date.now()}`;
  return mongoose.model<ITestDoc>(modelName, schema);
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('applyTenantIsolation', () => {
  describe('idempotency', () => {
    it('does not register hooks twice when called multiple times on the same schema', () => {
      const schema = new Schema<ITestDoc>({
        name: { type: String, required: true },
        tenantId: { type: String, index: true },
      });

      applyTenantIsolation(schema);
      const hooksAfterFirst = (
        schema as Schema & { s: { hooks: { _pres: Map<string, unknown[]> } } }
      ).s.hooks._pres;
      const countFirst = Array.from(hooksAfterFirst.values()).reduce(
        (sum, arr) => sum + arr.length,
        0,
      );

      applyTenantIsolation(schema);
      const hooksAfterSecond = (
        schema as Schema & { s: { hooks: { _pres: Map<string, unknown[]> } } }
      ).s.hooks._pres;
      const countSecond = Array.from(hooksAfterSecond.values()).reduce(
        (sum, arr) => sum + arr.length,
        0,
      );

      expect(countFirst).toBeGreaterThan(0);
      expect(countSecond).toBe(countFirst);
    });
  });

  describe('query filtering', () => {
    let TestModel: mongoose.Model<ITestDoc>;

    beforeAll(() => {
      TestModel = createTestModel('query');
    });

    beforeEach(async () => {
      await TestModel.deleteMany({});
      await TestModel.create([
        { name: 'tenant-a-doc', tenantId: 'tenant-a' },
        { name: 'tenant-b-doc', tenantId: 'tenant-b' },
        { name: 'no-tenant-doc' },
      ]);
    });

    it('injects tenantId filter into find when context is set', async () => {
      const docs = await tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
        TestModel.find().lean(),
      );

      expect(docs).toHaveLength(1);
      expect(docs[0].name).toBe('tenant-a-doc');
    });

    it('injects tenantId filter into findOne', async () => {
      const doc = await tenantStorage.run({ tenantId: 'tenant-b' }, async () =>
        TestModel.findOne({ name: 'tenant-a-doc' }).lean(),
      );

      expect(doc).toBeNull();
    });

    it('does not inject filter when context is absent (non-strict)', async () => {
      const docs = await TestModel.find().lean();
      expect(docs).toHaveLength(3);
    });

    it('bypasses filter for SYSTEM_TENANT_ID', async () => {
      const docs = await tenantStorage.run({ tenantId: SYSTEM_TENANT_ID }, async () =>
        TestModel.find().lean(),
      );

      expect(docs).toHaveLength(3);
    });

    it('injects tenantId filter into countDocuments', async () => {
      const count = await tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
        TestModel.countDocuments(),
      );

      expect(count).toBe(1);
    });

    it('injects tenantId filter into findOneAndUpdate', async () => {
      const doc = await tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
        TestModel.findOneAndUpdate(
          { name: 'tenant-b-doc' },
          { $set: { name: 'updated' } },
          { new: true },
        ).lean(),
      );

      expect(doc).toBeNull();
      const original = await TestModel.findOne({ name: 'tenant-b-doc' }).lean();
      expect(original).not.toBeNull();
    });

    it('injects tenantId filter into deleteOne', async () => {
      await tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
        TestModel.deleteOne({ name: 'tenant-b-doc' }),
      );

      const doc = await TestModel.findOne({ name: 'tenant-b-doc' }).lean();
      expect(doc).not.toBeNull();
    });

    it('injects tenantId filter into updateMany', async () => {
      await tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
        TestModel.updateMany({}, { $set: { name: 'updated' } }),
      );

      const tenantBDoc = await TestModel.findOne({ tenantId: 'tenant-b' }).lean();
      expect(tenantBDoc!.name).toBe('tenant-b-doc');

      const tenantADoc = await TestModel.findOne({ tenantId: 'tenant-a' }).lean();
      expect(tenantADoc!.name).toBe('updated');
    });
  });

  describe('aggregate filtering', () => {
    let TestModel: mongoose.Model<ITestDoc>;

    beforeAll(() => {
      TestModel = createTestModel('aggregate');
    });

    beforeEach(async () => {
      await TestModel.deleteMany({});
      await TestModel.create([
        { name: 'agg-a', tenantId: 'tenant-a' },
        { name: 'agg-b', tenantId: 'tenant-b' },
        { name: 'agg-none' },
      ]);
    });

    it('prepends $match stage with tenantId to aggregate pipeline', async () => {
      const results = await tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
        TestModel.aggregate([{ $project: { name: 1 } }]),
      );

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('agg-a');
    });

    it('does not filter aggregate when no context is set (non-strict)', async () => {
      const results = await TestModel.aggregate([{ $project: { name: 1 } }]);
      expect(results).toHaveLength(3);
    });

    it('bypasses aggregate filter for SYSTEM_TENANT_ID', async () => {
      const results = await tenantStorage.run({ tenantId: SYSTEM_TENANT_ID }, async () =>
        TestModel.aggregate([{ $project: { name: 1 } }]),
      );

      expect(results).toHaveLength(3);
    });
  });

  describe('save hook', () => {
    let TestModel: mongoose.Model<ITestDoc>;

    beforeAll(() => {
      TestModel = createTestModel('save');
    });

    beforeEach(async () => {
      await TestModel.deleteMany({});
    });

    it('stamps tenantId on save for new documents', async () => {
      const doc = await tenantStorage.run({ tenantId: 'tenant-x' }, async () => {
        const d = new TestModel({ name: 'new-doc' });
        await d.save();
        return d;
      });

      expect(doc.tenantId).toBe('tenant-x');
    });

    it('does not overwrite existing tenantId on save', async () => {
      const doc = await tenantStorage.run({ tenantId: 'tenant-x' }, async () => {
        const d = new TestModel({ name: 'existing', tenantId: 'tenant-original' });
        await d.save();
        return d;
      });

      expect(doc.tenantId).toBe('tenant-original');
    });

    it('does not set tenantId for SYSTEM_TENANT_ID', async () => {
      const doc = await tenantStorage.run({ tenantId: SYSTEM_TENANT_ID }, async () => {
        const d = new TestModel({ name: 'system-doc' });
        await d.save();
        return d;
      });

      expect(doc.tenantId).toBeUndefined();
    });

    it('saves without tenantId when no context is set (non-strict)', async () => {
      const doc = new TestModel({ name: 'no-context' });
      await doc.save();

      expect(doc.tenantId).toBeUndefined();
    });
  });

  describe('insertMany hook', () => {
    let TestModel: mongoose.Model<ITestDoc>;

    beforeAll(() => {
      TestModel = createTestModel('insertMany');
    });

    beforeEach(async () => {
      await TestModel.deleteMany({});
    });

    it('stamps tenantId on all insertMany docs', async () => {
      const docs = await tenantStorage.run({ tenantId: 'tenant-bulk' }, async () =>
        TestModel.insertMany([{ name: 'bulk-1' }, { name: 'bulk-2' }]),
      );

      expect(docs).toHaveLength(2);
      for (const doc of docs) {
        expect(doc.tenantId).toBe('tenant-bulk');
      }
    });

    it('does not overwrite existing tenantId in insertMany', async () => {
      const docs = await tenantStorage.run({ tenantId: 'tenant-bulk' }, async () =>
        TestModel.insertMany([{ name: 'pre-set', tenantId: 'tenant-original' }]),
      );

      expect(docs[0].tenantId).toBe('tenant-original');
    });

    it('does not hang when no tenant context is set (non-strict)', async () => {
      const docs = await TestModel.insertMany([{ name: 'no-context-bulk' }]);

      expect(docs).toHaveLength(1);
      expect(docs[0].tenantId).toBeUndefined();
    });

    it('does not stamp tenantId for SYSTEM_TENANT_ID', async () => {
      const docs = await tenantStorage.run({ tenantId: SYSTEM_TENANT_ID }, async () =>
        TestModel.insertMany([{ name: 'system-bulk' }]),
      );

      expect(docs[0].tenantId).toBeUndefined();
    });
  });

  describe('runAsSystem', () => {
    let TestModel: mongoose.Model<ITestDoc>;

    beforeAll(() => {
      TestModel = createTestModel('runAsSystem');
    });

    beforeEach(async () => {
      await TestModel.deleteMany({});
      await TestModel.create([
        { name: 'sys-a', tenantId: 'tenant-a' },
        { name: 'sys-b', tenantId: 'tenant-b' },
      ]);
    });

    it('bypasses tenant filter inside runAsSystem', async () => {
      const { runAsSystem } = await import('~/config/tenantContext');

      const docs = await tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
        runAsSystem(async () => TestModel.find().lean()),
      );

      expect(docs).toHaveLength(2);
    });

    it('propagates through await boundaries', async () => {
      const docs = await tenantStorage.run({ tenantId: 'tenant-a' }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return TestModel.find().lean();
      });

      expect(docs).toHaveLength(1);
      expect(docs[0].name).toBe('sys-a');
    });
  });
});
