import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { TenantProbe, TenantCommandRecord } from './probe';
import { tenantStorage, SYSTEM_TENANT_ID } from '~/config/tenantContext';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import { tenantSafeBulkWrite } from '~/utils/tenantBulkWrite';
import { attachTenantProbe, unscoped } from './probe';

/**
 * Completeness proof for the Mongoose tenant-isolation binding.
 *
 * Every other tenant test asserts what a query *returns*. These assert what
 * reaches the database, which is the only way to catch a path the binding never
 * hooked. In particular this pins the reason the middleware cannot be replaced
 * by a wrapper around the model's static methods: document-level writes and
 * populate never pass through such a wrapper, but they do reach the wire.
 */

interface WidgetDocument {
  name: string;
  tenantId?: string;
  parts: mongoose.Types.ObjectId[];
}

interface PartDocument {
  label: string;
  tenantId?: string;
}

const TENANT = 'tenant-a';

let server: MongoMemoryServer;
let probe: TenantProbe;
let Widget: mongoose.Model<WidgetDocument>;
let Part: mongoose.Model<PartDocument>;

const asTenant = <T>(fn: () => Promise<T>): Promise<T> =>
  tenantStorage.run({ tenantId: TENANT }, fn);

const describeLeaks = (records: readonly TenantCommandRecord[]): string =>
  unscoped(records)
    .map((record) => `${record.commandName} on ${record.collection}: ${record.predicate}`)
    .join('\n');

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { monitorCommands: true });

  const partSchema = new mongoose.Schema<PartDocument>({
    label: String,
    tenantId: { type: String, index: true },
  });
  applyTenantIsolation(partSchema);
  Part = mongoose.model<PartDocument>('ProbePart', partSchema);

  const widgetSchema = new mongoose.Schema<WidgetDocument>({
    name: String,
    tenantId: { type: String, index: true },
    parts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ProbePart' }],
  });
  applyTenantIsolation(widgetSchema);
  Widget = mongoose.model<WidgetDocument>('ProbeWidget', widgetSchema);

  probe = attachTenantProbe(mongoose.connection, [
    Widget.collection.collectionName,
    Part.collection.collectionName,
  ]);
});

afterAll(async () => {
  probe.close();
  await mongoose.disconnect();
  await server.stop();
});

beforeEach(async () => {
  await tenantStorage.run({ tenantId: SYSTEM_TENANT_ID }, async () => {
    await Widget.deleteMany({});
    await Part.deleteMany({});
  });
});

describe('the probe itself', () => {
  it('detects a command that reached the wire unscoped', async () => {
    const records = await probe.record(() =>
      asTenant(async () => {
        await mongoose.connection
          .db!.collection(Widget.collection.collectionName)
          .find({})
          .toArray();
      }),
    );

    expect(unscoped(records)).toHaveLength(1);
    expect(records[0].commandName).toBe('find');
  });

  /**
   * The probe must never over-report scoping: a filter it wrongly calls scoped
   * turns a leak into a green test, which is worse than having no probe.
   */
  it.each([
    ['a permissive $or branch', { $or: [{ tenantId: TENANT }, {}] }],
    ['tenantId nested under an unrelated field', { meta: { tenantId: TENANT } }],
    ['$nor, which negates its branches', { $nor: [{ tenantId: TENANT }] }],
    ['an $or branch that matches other tenants', { $or: [{ tenantId: TENANT }, { name: 'x' }] }],
    ['$ne, which selects every other tenant', { tenantId: { $ne: TENANT } }],
    ['a multi-valued $in', { tenantId: { $in: [TENANT, 'tenant-b'] } }],
    ['a regex over tenants', { tenantId: { $regex: '.*' } }],
    ['$exists: true, which matches any tenant', { tenantId: { $exists: true } }],
  ])('does not accept %s as scoping', async (_label, filter) => {
    const records = await probe.record(() =>
      asTenant(async () => {
        await mongoose.connection
          .db!.collection(Widget.collection.collectionName)
          .find(filter)
          .toArray();
      }),
    );

    expect(unscoped(records)).toHaveLength(1);
  });

  it.each([
    [
      'every $or branch constrained',
      { $or: [{ tenantId: TENANT }, { tenantId: TENANT, name: 'x' }] },
    ],
    ['one $and branch constrained', { $and: [{ tenantId: TENANT }, { name: 'x' }] }],
    ['an explicitly unset tenant', { tenantId: { $exists: false } }],
    ['a singleton $in', { tenantId: { $in: [TENANT] } }],
    ['an explicit $eq', { tenantId: { $eq: TENANT } }],
  ])('accepts %s as scoping', async (_label, filter) => {
    const records = await probe.record(() =>
      asTenant(async () => {
        await mongoose.connection
          .db!.collection(Widget.collection.collectionName)
          .find(filter)
          .toArray();
      }),
    );

    expect(records).toHaveLength(1);
    expect(unscoped(records)).toHaveLength(0);
  });

  it('judges an aggregate by its $match stages, not by any mention', async () => {
    const unmatched = await probe.record(() =>
      asTenant(async () => {
        await mongoose.connection
          .db!.collection(Widget.collection.collectionName)
          .aggregate([{ $group: { _id: '$tenantId' } }])
          .toArray();
      }),
    );
    expect(unscoped(unmatched)).toHaveLength(1);

    const matched = await probe.record(() =>
      asTenant(async () => {
        await mongoose.connection
          .db!.collection(Widget.collection.collectionName)
          .aggregate([{ $match: { tenantId: TENANT } }])
          .toArray();
      }),
    );
    expect(unscoped(matched)).toHaveLength(0);
  });

  /**
   * A `$lookup` reads its foreign collection inside the *outer* command, so the
   * listener never sees a separate predicate for it. An outer `$match` alone
   * therefore proves nothing about the joined read, and the probe fails closed.
   */
  it('does not accept an outer $match as scoping a joined collection', async () => {
    const records = await probe.record(() =>
      asTenant(async () => {
        await mongoose.connection
          .db!.collection(Widget.collection.collectionName)
          .aggregate([
            { $match: { tenantId: TENANT } },
            {
              $lookup: {
                from: Part.collection.collectionName,
                localField: 'parts',
                foreignField: '_id',
                as: 'joined',
              },
            },
          ])
          .toArray();
      }),
    );

    expect(unscoped(records)).toHaveLength(1);
  });

  it('accepts a $lookup whose sub-pipeline constrains the tenant', async () => {
    const records = await probe.record(() =>
      asTenant(async () => {
        await mongoose.connection
          .db!.collection(Widget.collection.collectionName)
          .aggregate([
            { $match: { tenantId: TENANT } },
            {
              $lookup: {
                from: Part.collection.collectionName,
                pipeline: [{ $match: { tenantId: TENANT } }],
                as: 'joined',
              },
            },
          ])
          .toArray();
      }),
    );

    expect(unscoped(records)).toHaveLength(0);
  });

  it('reports nothing for collections it does not watch', async () => {
    const records = await probe.record(() =>
      asTenant(async () => {
        await mongoose.connection.db!.collection('unwatched').find({}).toArray();
      }),
    );

    expect(records).toHaveLength(0);
  });
});

describe('query paths reach the wire scoped', () => {
  it.each([
    ['find', () => Widget.find({ name: 'x' })],
    ['findOne', () => Widget.findOne({ name: 'x' })],
    ['countDocuments', () => Widget.countDocuments({ name: 'x' })],
    ['distinct', () => Widget.distinct('name')],
    ['updateOne', () => Widget.updateOne({ name: 'x' }, { $set: { name: 'y' } })],
    ['updateMany', () => Widget.updateMany({ name: 'x' }, { $set: { name: 'y' } })],
    ['deleteOne', () => Widget.deleteOne({ name: 'x' })],
    ['deleteMany', () => Widget.deleteMany({ name: 'x' })],
    ['findOneAndUpdate', () => Widget.findOneAndUpdate({ name: 'x' }, { $set: { name: 'y' } })],
    ['findOneAndDelete', () => Widget.findOneAndDelete({ name: 'x' })],
    ['replaceOne', () => Widget.replaceOne({ name: 'x' }, { name: 'y' })],
    ['findOneAndReplace', () => Widget.findOneAndReplace({ name: 'x' }, { name: 'y' })],
    ['aggregate', () => Widget.aggregate([{ $group: { _id: '$name' } }])],
  ])('%s', async (_label, operation) => {
    const records = await probe.record(() => asTenant(async () => void (await operation())));

    expect(records.length).toBeGreaterThan(0);
    expect(describeLeaks(records)).toBe('');
  });
});

/**
 * `estimatedDocumentCount()` reads collection metadata and takes no filter, so
 * no binding can scope it — it is a genuine global side channel, currently used
 * once at `models/plugins/mongoMeili.ts` for a sync progress log on a boot path.
 * Pinned so it stays visible; making scoped callers fail closed is a runtime
 * change and belongs in its own PR.
 */
describe('estimatedDocumentCount is a known unscoped side channel', () => {
  it('reaches the wire with no tenant predicate', async () => {
    const records = await probe.record(() =>
      asTenant(async () => void (await Widget.estimatedDocumentCount())),
    );

    expect(records).toHaveLength(1);
    expect(records[0].scoped).toBe(false);
  });
});

describe('write paths reach the wire scoped', () => {
  it('Model.create', async () => {
    const records = await probe.record(() =>
      asTenant(async () => void (await Widget.create({ name: 'created', parts: [] }))),
    );

    expect(records.length).toBeGreaterThan(0);
    expect(describeLeaks(records)).toBe('');
  });

  it('insertMany', async () => {
    const records = await probe.record(() =>
      asTenant(async () => void (await Widget.insertMany([{ name: 'a' }, { name: 'b' }]))),
    );

    expect(records.length).toBeGreaterThan(0);
    expect(describeLeaks(records)).toBe('');
  });

  it('tenantSafeBulkWrite', async () => {
    const records = await probe.record(() =>
      asTenant(async () =>
        tenantSafeBulkWrite(Widget, [
          { insertOne: { document: { name: 'bulk' } } },
          { updateOne: { filter: { name: 'bulk' }, update: { $set: { name: 'bulk2' } } } },
          { deleteOne: { filter: { name: 'gone' } } },
        ]),
      ),
    );

    expect(records.length).toBeGreaterThan(0);
    expect(describeLeaks(records)).toBe('');
  });
});

/**
 * These are the paths that make schema middleware irreplaceable: none of them
 * pass through a wrapper around the model's static methods, but all of them
 * reach the database.
 */
describe('document-level paths reach the wire scoped', () => {
  it('doc.save() on a new document', async () => {
    const records = await probe.record(() =>
      asTenant(async () => {
        const widget = new Widget({ name: 'saved' });
        await widget.save();
      }),
    );

    expect(records.length).toBeGreaterThan(0);
    expect(describeLeaks(records)).toBe('');
  });

  /**
   * KNOWN GAP, found by this probe. Saving an already-persisted document issues
   * `update` filtered on `_id` alone — the tenant is stamped onto the payload but
   * never asserted in the predicate. It is scoped by provenance (you can only
   * fetch a document your tenant can see), so the normal flow is safe, but an
   * `_id` obtained from an unscoped source — `runAsSystem`, a cached id, a
   * client-supplied id — writes across tenants unguarded.
   *
   * Pinned here rather than fixed: closing it changes runtime behaviour and
   * belongs in its own change. The assertion is written to FAIL once the
   * predicate is added, so the fix cannot land without updating this test.
   */
  it('doc.save() on a fetched document is scoped by provenance, not by predicate', async () => {
    await asTenant(async () => void (await Widget.create({ name: 'fetched', parts: [] })));

    const records = await probe.record(() =>
      asTenant(async () => {
        const widget = await Widget.findOne({ name: 'fetched' });
        widget!.name = 'renamed';
        await widget!.save();
      }),
    );

    const updates = records.filter((record) => record.commandName === 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0].scoped).toBe(false);
    expect(updates[0].predicate).toContain('_id');
  });

  it('doc.updateOne()', async () => {
    await asTenant(async () => void (await Widget.create({ name: 'target', parts: [] })));

    const records = await probe.record(() =>
      asTenant(async () => {
        const widget = await Widget.findOne({ name: 'target' });
        await widget!.updateOne({ $set: { name: 'updated' } });
      }),
    );

    expect(records.length).toBeGreaterThan(0);
    expect(describeLeaks(records)).toBe('');
  });

  /**
   * `Document.prototype.deleteOne()` is called out in `schema/auditLog.ts` as an
   * escape hatch around *document* middleware. It is not one for tenant
   * filtering — it builds a Query, so the query-level hook still fires — but
   * nothing pinned that, so a future change could silently make it one.
   */
  it('doc.deleteOne() reaches the wire scoped', async () => {
    await asTenant(async () => void (await Widget.create({ name: 'doomed', parts: [] })));

    const records = await probe.record(() =>
      asTenant(async () => {
        const widget = await Widget.findOne({ name: 'doomed' });
        await widget!.deleteOne();
      }),
    );

    const deletes = records.filter((record) => record.commandName === 'delete');
    expect(deletes).toHaveLength(1);
    expect(describeLeaks(records)).toBe('');
  });

  it('doc.deleteOne() cannot remove another tenant document', async () => {
    const foreign = await tenantStorage.run({ tenantId: 'tenant-b' }, async () =>
      Widget.create({ name: 'foreign-doomed', parts: [] }),
    );
    const smuggled = await tenantStorage.run({ tenantId: SYSTEM_TENANT_ID }, async () =>
      Widget.findById(foreign._id),
    );

    await asTenant(async () => void (await smuggled!.deleteOne()));

    const survivor = await tenantStorage.run({ tenantId: SYSTEM_TENANT_ID }, async () =>
      Widget.findById(foreign._id).lean(),
    );
    expect(survivor).not.toBeNull();
  });

  it('populate() issues its own query', async () => {
    await asTenant(async () => {
      const part = await Part.create({ label: 'part-1' });
      await Widget.create({ name: 'parent', parts: [part._id] });
    });

    const records = await probe.record(() =>
      asTenant(async () => void (await Widget.findOne({ name: 'parent' }).populate('parts'))),
    );

    const partReads = records.filter(
      (record) => record.collection === Part.collection.collectionName,
    );
    expect(partReads.length).toBeGreaterThan(0);
    expect(describeLeaks(records)).toBe('');
  });
});

describe('system scope', () => {
  it('deliberately reaches the wire unscoped', async () => {
    const records = await probe.record(() =>
      tenantStorage.run({ tenantId: SYSTEM_TENANT_ID }, async () => {
        await Widget.find({ name: 'x' });
      }),
    );

    expect(unscoped(records)).toHaveLength(1);
  });
});
