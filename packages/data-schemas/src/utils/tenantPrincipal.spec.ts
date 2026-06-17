import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { ITenant } from '~/types';
import tenantSchema from '~/schema/tenant';
import { resolveTenantPrincipalId } from './tenantPrincipal';

let mongoServer: MongoMemoryServer;
let Tenant: mongoose.Model<ITenant>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  Tenant = mongoose.models.Tenant || mongoose.model<ITenant>('Tenant', tenantSchema);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Tenant.deleteMany({});
});

describe('resolveTenantPrincipalId', () => {
  it('maps legacy tenants.tenantId to tenants._id', async () => {
    const legacyId = new Types.ObjectId().toString();
    const tenant = await Tenant.create({
      tenantId: legacyId,
      name: 'Apple',
    });

    expect(await resolveTenantPrincipalId(mongoose, legacyId)).toBe(tenant._id.toString());
  });

  it('returns canonical _id when ref is already tenants._id', async () => {
    const legacyId = new Types.ObjectId().toString();
    const tenant = await Tenant.create({
      tenantId: legacyId,
      name: 'Canonical',
    });

    expect(await resolveTenantPrincipalId(mongoose, tenant._id.toString())).toBe(
      tenant._id.toString(),
    );
  });

  it('returns ref unchanged when no tenant document exists', async () => {
    expect(await resolveTenantPrincipalId(mongoose, 'tenant-abc')).toBe('tenant-abc');
  });

  it('returns undefined for empty ref', async () => {
    expect(await resolveTenantPrincipalId(mongoose, '  ')).toBeUndefined();
  });
});
