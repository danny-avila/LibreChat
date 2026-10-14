import type { ServerRequest } from '~/types/http';
import { createMCPServerAuditor, diffMCPServerFields } from './audit';

const req = { user: { id: 'user-1', name: 'Alice' }, headers: {} } as unknown as ServerRequest;

describe('diffMCPServerFields', () => {
  it('returns sorted names of changed user-input fields only', () => {
    expect(
      diffMCPServerFields(
        { url: 'https://a', title: 'T', headers: { A: '1' }, dbId: 'x' },
        { url: 'https://b', title: 'T', headers: { A: '2' }, dbId: 'y' },
      ),
    ).toEqual(['headers', 'url']);
  });

  it('ignores key order inside record fields', () => {
    expect(
      diffMCPServerFields({ headers: { A: '1', B: '2' } }, { headers: { B: '2', A: '1' } }),
    ).toEqual([]);
  });

  it('treats a missing side as all-new', () => {
    expect(diffMCPServerFields(undefined, { type: 'sse', url: 'https://a' })).toEqual([
      'type',
      'url',
    ]);
  });
});

describe('createMCPServerAuditor', () => {
  it('lists no fields for a delete', async () => {
    const recordAuditEntry = jest.fn().mockResolvedValue(undefined);
    const audit = createMCPServerAuditor({ recordAuditEntry });

    await audit(req, {
      action: 'mcp_server.deleted',
      serverName: 'srv',
      previous: { url: 'https://a', title: 'Srv' },
    });

    expect(recordAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'mcp_server.deleted',
        severity: 'warning',
        target: { type: 'mcp_server', id: 'srv', name: 'Srv' },
        metadata: { source: 'DB' },
      }),
    );
  });

  it('does not record a preserved OAuth secret as a change', async () => {
    const recordAuditEntry = jest.fn().mockResolvedValue(undefined);
    const audit = createMCPServerAuditor({ recordAuditEntry });

    await audit(req, {
      action: 'mcp_server.updated',
      serverName: 'srv',
      previous: { title: 'Old', oauth: { client_id: 'id', client_secret: 'stored' } },
      next: { title: 'New', oauth: { client_id: 'id' } },
    });

    expect(recordAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { source: 'DB', fields: 'title' } }),
    );
  });

  it('does not record omitted optional OAuth binding fields as a change', async () => {
    const recordAuditEntry = jest.fn().mockResolvedValue(undefined);
    const audit = createMCPServerAuditor({ recordAuditEntry });

    await audit(req, {
      action: 'mcp_server.updated',
      serverName: 'srv',
      previous: {
        title: 'Old',
        oauth: {
          client_id: 'id',
          client_secret: 'stored',
          revocation_endpoint: 'https://idp.example/revoke',
          token_endpoint_auth_methods_supported: ['client_secret_basic'],
        },
      },
      next: { title: 'New', oauth: { client_id: 'id' } },
    });

    expect(recordAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { source: 'DB', fields: 'title' } }),
    );
  });

  it('runs the post-commit steps before the audit write and still audits when they throw', async () => {
    const order: string[] = [];
    const recordAuditEntry = jest.fn().mockImplementation(async () => void order.push('audit'));
    const audit = createMCPServerAuditor({ recordAuditEntry });

    await expect(
      audit(req, { action: 'mcp_server.deleted', serverName: 'srv' }, async () => {
        order.push('fence');
        throw new Error('fence failed');
      }),
    ).rejects.toThrow('fence failed');

    expect(order).toEqual(['fence', 'audit']);
  });

  it('is a no-op without a recorder', async () => {
    await expect(
      createMCPServerAuditor({})(req, { action: 'mcp_server.created', serverName: 'srv' }),
    ).resolves.toBeUndefined();
  });
});
