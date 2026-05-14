import mongoose, { Types } from 'mongoose';
import { PrincipalType } from 'librechat-data-provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type * as t from '~/types';
import type { RecordAuditEntryInput } from '~/types';
import { createAuditLogMethods } from './auditLog';
import auditLogSchema from '~/schema/auditLog';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: MongoMemoryServer;
let AuditLog: mongoose.Model<t.IAuditLog>;
let methods: ReturnType<typeof createAuditLogMethods>;

const actorObjectId = new Types.ObjectId();
const targetObjectId = new Types.ObjectId();

function baseInput(over: Partial<RecordAuditEntryInput> = {}): RecordAuditEntryInput {
  return {
    action: 'grant_assigned',
    actorId: actorObjectId,
    actorName: 'Alice Admin',
    targetPrincipalType: PrincipalType.USER,
    targetPrincipalId: targetObjectId,
    targetName: 'Bob User',
    capability: 'manage:users',
    tenantId: 'tenant-a',
    ...over,
  };
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  AuditLog = mongoose.models.AuditLog || mongoose.model<t.IAuditLog>('AuditLog', auditLogSchema);
  methods = createAuditLogMethods(mongoose);
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  // AuditLog enforces append-only via pre-hooks, so reset between tests by
  // dropping the collection at the raw driver level (bypasses model hooks).
  await AuditLog.collection.deleteMany({});
});

describe('auditLog methods', () => {
  describe('recordAuditEntry', () => {
    it('persists a tenant-scoped entry and wires denormalized fields through', async () => {
      const doc = await methods.recordAuditEntry(baseInput());
      expect(doc).not.toBeNull();
      const persisted = await AuditLog.findOne({ tenantId: 'tenant-a' }).lean();
      expect(persisted?.actorName).toBe('Alice Admin');
      expect(persisted?.targetName).toBe('Bob User');
      expect(persisted?.capability).toBe('manage:users');
      expect(persisted?.createdAt).toBeInstanceOf(Date);
    });

    it('omits the tenantId field entirely for platform-level entries', async () => {
      await methods.recordAuditEntry(baseInput({ tenantId: undefined }));
      const raw = await AuditLog.collection.findOne({});
      expect(raw && Object.prototype.hasOwnProperty.call(raw, 'tenantId')).toBe(false);
    });
  });

  describe('listAuditLogPage', () => {
    beforeEach(async () => {
      await methods.recordAuditEntry(baseInput({ capability: 'manage:users' }));
      await methods.recordAuditEntry(
        baseInput({ action: 'grant_removed', capability: 'manage:roles' }),
      );
      await methods.recordAuditEntry(baseInput({ tenantId: 'tenant-b', capability: 'read:users' }));
      await methods.recordAuditEntry(
        baseInput({ tenantId: undefined, capability: 'access:admin' }),
      );
    });

    it('returns only the calling tenant by default', async () => {
      const page = await methods.listAuditLogPage('tenant-a', {});
      expect(page.total).toBe(2);
      const tenants = new Set(page.entries.map((e) => e.capability));
      expect(tenants).toEqual(new Set(['manage:users', 'manage:roles']));
    });

    it('only returns platform-level entries when tenantId is omitted', async () => {
      const page = await methods.listAuditLogPage(undefined, {});
      expect(page.total).toBe(1);
      expect(page.entries[0]?.capability).toBe('access:admin');
    });

    it('filters by a single action', async () => {
      const page = await methods.listAuditLogPage('tenant-a', { action: ['grant_removed'] });
      expect(page.total).toBe(1);
      expect(page.entries[0]?.action).toBe('grant_removed');
    });

    it('filters by multiple actions via $in', async () => {
      const page = await methods.listAuditLogPage('tenant-a', {
        action: ['grant_assigned', 'grant_removed'],
      });
      expect(page.total).toBe(2);
    });

    it('partial-matches the actorQuery param against actorName', async () => {
      await methods.recordAuditEntry(baseInput({ actorName: 'Charlotte Auditor' }));
      const page = await methods.listAuditLogPage('tenant-a', { actorQuery: 'charlotte' });
      expect(page.total).toBe(1);
      expect(page.entries[0]?.actorName).toBe('Charlotte Auditor');
    });

    it('partial-matches the targetQuery param against targetName', async () => {
      await methods.recordAuditEntry(baseInput({ targetName: 'Daphne Director' }));
      const page = await methods.listAuditLogPage('tenant-a', { targetQuery: 'daphne' });
      expect(page.total).toBe(1);
      expect(page.entries[0]?.targetName).toBe('Daphne Director');
    });

    it('treats empty-string tenantId as platform-level (not a literal `""` tenant match)', async () => {
      const page = await methods.listAuditLogPage('', {});
      expect(page.total).toBe(1);
      expect(page.entries[0]?.capability).toBe('access:admin');
    });

    it('treats whitespace-only tenantId as platform-level', async () => {
      const page = await methods.listAuditLogPage('   ', {});
      expect(page.total).toBe(1);
      expect(page.entries[0]?.capability).toBe('access:admin');
    });

    it('partial-matches the capability filter case-insensitively', async () => {
      const page = await methods.listAuditLogPage('tenant-a', { capability: 'ROLES' });
      expect(page.total).toBe(1);
      expect(page.entries[0]?.capability).toBe('manage:roles');
    });

    it('applies a `from` / `to` window using createdAt', async () => {
      const allBefore = await AuditLog.find({ tenantId: 'tenant-a' }).sort({ createdAt: 1 }).lean();
      const cutoff = allBefore[0]!.createdAt;
      const after = new Date(cutoff.getTime() + 1);
      const page = await methods.listAuditLogPage('tenant-a', { from: after });
      expect(page.total).toBeLessThan(2);
    });

    it('paginates by offset and limit and reports the total of the full match set', async () => {
      const page1 = await methods.listAuditLogPage('tenant-a', { offset: 0, limit: 1 });
      const page2 = await methods.listAuditLogPage('tenant-a', { offset: 1, limit: 1 });
      expect(page1.total).toBe(2);
      expect(page2.total).toBe(2);
      expect(page1.entries.length).toBe(1);
      expect(page2.entries.length).toBe(1);
      expect(page1.entries[0]?.id).not.toBe(page2.entries[0]?.id);
    });

    it('stringifies ObjectIds and dates on the wire', async () => {
      const page = await methods.listAuditLogPage('tenant-a', { limit: 1 });
      const entry = page.entries[0]!;
      expect(typeof entry.id).toBe('string');
      expect(typeof entry.actorId).toBe('string');
      expect(typeof entry.targetPrincipalId).toBe('string');
      expect(typeof entry.timestamp).toBe('string');
      expect(() => new Date(entry.timestamp).toISOString()).not.toThrow();
    });

    it('escapes regex metacharacters in the search input', async () => {
      await methods.recordAuditEntry(baseInput({ actorName: 'risky.dot+plus' }));
      const page = await methods.listAuditLogPage('tenant-a', { search: 'risky.dot+plus' });
      expect(page.total).toBe(1);
    });
  });

  describe('append-only enforcement', () => {
    it('rejects updateOne against any audit entry', async () => {
      const doc = await methods.recordAuditEntry(baseInput());
      await expect(
        AuditLog.updateOne({ _id: doc!._id }, { capability: 'tampered' }),
      ).rejects.toThrow(/append-only/);
    });

    it('rejects findOneAndUpdate against any audit entry', async () => {
      const doc = await methods.recordAuditEntry(baseInput());
      await expect(
        AuditLog.findOneAndUpdate({ _id: doc!._id }, { capability: 'tampered' }),
      ).rejects.toThrow(/append-only/);
    });

    it('rejects deleteOne against any audit entry', async () => {
      const doc = await methods.recordAuditEntry(baseInput());
      await expect(AuditLog.deleteOne({ _id: doc!._id })).rejects.toThrow(/append-only/);
    });

    it('rejects deleteMany', async () => {
      await methods.recordAuditEntry(baseInput());
      await expect(AuditLog.deleteMany({})).rejects.toThrow(/append-only/);
    });

    it('rejects a second save() on an existing document', async () => {
      const doc = await methods.recordAuditEntry(baseInput());
      const persisted = (await AuditLog.findById(doc!._id))!;
      persisted.capability = 'tampered';
      await expect(persisted.save()).rejects.toThrow(/append-only/);
    });

    it('does not stamp updatedAt on new documents', async () => {
      const doc = await methods.recordAuditEntry(baseInput());
      const raw = await AuditLog.collection.findOne({ _id: doc!._id });
      expect(raw && Object.prototype.hasOwnProperty.call(raw, 'updatedAt')).toBe(false);
    });
  });

  describe('streamAuditLogEntries', () => {
    it('invokes onEntry for every match without skipping tenant boundaries', async () => {
      await methods.recordAuditEntry(baseInput({ capability: 'manage:users' }));
      await methods.recordAuditEntry(baseInput({ capability: 'manage:roles' }));
      await methods.recordAuditEntry(baseInput({ tenantId: 'tenant-b' }));

      const collected: string[] = [];
      const count = await methods.streamAuditLogEntries('tenant-a', {}, (entry) => {
        collected.push(entry.capability);
      });
      expect(count).toBe(2);
      expect(new Set(collected)).toEqual(new Set(['manage:users', 'manage:roles']));
    });

    it('stops iterating and closes the cursor when isCancelled becomes true', async () => {
      for (let i = 0; i < 10; i++) {
        await methods.recordAuditEntry(baseInput({ capability: `manage:cap-${i}` }));
      }

      let cancelled = false;
      const seen: string[] = [];
      const count = await methods.streamAuditLogEntries(
        'tenant-a',
        {},
        (entry) => {
          seen.push(entry.capability);
          if (seen.length >= 3) cancelled = true;
        },
        { isCancelled: () => cancelled },
      );

      expect(count).toBe(3);
      expect(seen.length).toBe(3);
    });

    it('stops after maxRows entries even if more remain', async () => {
      for (let i = 0; i < 10; i++) {
        await methods.recordAuditEntry(baseInput({ capability: `manage:cap-${i}` }));
      }

      const seen: string[] = [];
      const count = await methods.streamAuditLogEntries(
        'tenant-a',
        {},
        (entry) => {
          seen.push(entry.capability);
        },
        { maxRows: 4 },
      );

      expect(count).toBe(4);
      expect(seen.length).toBe(4);
    });
  });
});
