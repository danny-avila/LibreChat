import { Keyv } from 'keyv';
import { logger, tenantStorage } from '@librechat/data-schemas';
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

describe('FlowStateManager flow keys are not tenant-scoped', () => {
  let manager: FlowStateManager;

  beforeEach(() => {
    jest.clearAllMocks();
    const store = new Keyv({ store: new Map() });
    manager = new FlowStateManager(store, { ci: true, ttl: 60_000 });
  });

  it('completeFlow finds a flow regardless of tenant context (OAuth callback compatibility)', async () => {
    await tenantStorage.run({ tenantId: 'tenant-a' }, async () => {
      await manager.initFlow('flow-1', 'oauth', {});
    });

    const found = await manager.completeFlow('flow-1', 'oauth', { token: 'abc' });
    expect(found).toBe(true);
  });

  it('completeFlow works when both creation and completion have the same tenant', async () => {
    await tenantStorage.run({ tenantId: 'tenant-a' }, async () => {
      await manager.initFlow('flow-2', 'oauth', {});
      const found = await manager.completeFlow('flow-2', 'oauth', { token: 'abc' });
      expect(found).toBe(true);
    });
  });

  it('completeFlow returns false and logs when flow does not exist', async () => {
    const found = await manager.completeFlow('ghost-flow', 'oauth', { token: 'x' });
    expect(found).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('ghost-flow'),
      expect.objectContaining({ flowId: 'ghost-flow', type: 'oauth' }),
    );
  });
});
