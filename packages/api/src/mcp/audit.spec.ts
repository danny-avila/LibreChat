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

  it('is a no-op without a recorder', async () => {
    await expect(
      createMCPServerAuditor({})(req, { action: 'mcp_server.created', serverName: 'srv' }),
    ).resolves.toBeUndefined();
  });
});
