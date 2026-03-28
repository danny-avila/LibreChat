import { Keyv } from 'keyv';
import { tenantStorage } from '@librechat/data-schemas';
import { FlowStateManager } from './manager';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('FlowStateManager tenant-scoped keys', () => {
  let manager: FlowStateManager;

  beforeEach(() => {
    const store = new Keyv({ store: new Map() });
    manager = new FlowStateManager(store, { ci: true, ttl: 60_000 });
  });

  it('completeFlow finds a flow created under the same tenant context', async () => {
    await tenantStorage.run({ tenantId: 'tenant-a' }, async () => {
      await manager.initFlow('flow-1', 'oauth', {});
      const found = await manager.completeFlow('flow-1', 'oauth', { token: 'abc' });
      expect(found).toBe(true);
    });
  });

  it('completeFlow does NOT find a flow created under a different tenant context', async () => {
    await tenantStorage.run({ tenantId: 'tenant-a' }, async () => {
      await manager.initFlow('flow-1', 'oauth', {});
    });

    const found = await tenantStorage.run({ tenantId: 'tenant-b' }, async () =>
      manager.completeFlow('flow-1', 'oauth', { token: 'abc' }),
    );
    expect(found).toBe(false);
  });

  it('flows without tenant context are separate from tenant-scoped flows', async () => {
    await tenantStorage.run({ tenantId: 'tenant-a' }, async () => {
      await manager.initFlow('flow-2', 'oauth', {});
    });

    const foundWithoutTenant = await manager.completeFlow('flow-2', 'oauth', { token: 'abc' });
    expect(foundWithoutTenant).toBe(false);

    const foundWithTenant = await tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
      manager.completeFlow('flow-2', 'oauth', { token: 'abc' }),
    );
    expect(foundWithTenant).toBe(true);
  });
});
