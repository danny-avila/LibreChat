import type { MessageMethods } from '@librechat/data-schemas';
import { createSharedLangfuseSessionResolver } from './session';

const hasCapability = jest.fn();
const hasConfigCapability = jest.fn();
const getMessages = jest.fn() as unknown as MessageMethods['getMessages'];
const resolveSessionUrl = jest.fn();

const config = {
  enabled: true,
  destination: 'eu',
  projectId: 'project-1',
};

function createResolver() {
  return createSharedLangfuseSessionResolver({
    hasCapability,
    hasConfigCapability,
    getMessages,
    resolveSessionUrl,
  });
}

const validParams = {
  viewer: { id: 'admin-1', role: 'ADMIN', tenantId: 'tenant-1' },
  shareTenantId: 'tenant-1',
  shareConversationId: 'conversation-1',
  shareOwnerId: 'owner-1',
  config,
};

describe('createSharedLangfuseSessionResolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    hasCapability.mockResolvedValue(true);
    hasConfigCapability.mockResolvedValue(true);
    resolveSessionUrl.mockResolvedValue('https://cloud.langfuse.com/session-1');
  });

  it('resolves the source session for an authorized same-tenant admin', async () => {
    const result = await createResolver()(validParams);

    expect(result).toBe('https://cloud.langfuse.com/session-1');
    expect(hasCapability).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'admin-1', tenantId: 'tenant-1' }),
      'access:admin',
    );
    expect(hasConfigCapability).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'admin-1', tenantId: 'tenant-1' }),
      'langfuse',
    );
    expect(resolveSessionUrl).toHaveBeenCalledWith({
      config,
      conversationId: 'conversation-1',
      userId: 'owner-1',
      getMessages,
    });
  });

  it('rejects a viewer from another tenant before capability checks', async () => {
    const result = await createResolver()({
      ...validParams,
      viewer: { ...validParams.viewer, tenantId: 'tenant-2' },
    });

    expect(result).toBeNull();
    expect(hasCapability).not.toHaveBeenCalled();
    expect(resolveSessionUrl).not.toHaveBeenCalled();
  });

  it('rejects a viewer without admin access', async () => {
    hasCapability.mockResolvedValue(false);

    const result = await createResolver()(validParams);

    expect(result).toBeNull();
    expect(hasConfigCapability).not.toHaveBeenCalled();
    expect(resolveSessionUrl).not.toHaveBeenCalled();
  });

  it('rejects an admin without Langfuse config access', async () => {
    hasConfigCapability.mockResolvedValue(false);

    const result = await createResolver()(validParams);

    expect(result).toBeNull();
    expect(resolveSessionUrl).not.toHaveBeenCalled();
  });

  it('treats the system tenant and an omitted tenant as the same deployment', async () => {
    const result = await createResolver()({
      ...validParams,
      viewer: { id: 'admin-1', role: 'ADMIN' },
      shareTenantId: '__SYSTEM__',
    });

    expect(result).toBe('https://cloud.langfuse.com/session-1');
  });
});
