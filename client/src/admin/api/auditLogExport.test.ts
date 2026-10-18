import '~/admin/test/fetch';
import { READ_AUDIT_LOG_CAPABILITY } from '~/admin/constants';

/**
 * Tests for the streaming audit-log CSV export server function.
 *
 * Same harness as `capabilities.test.ts`: `createServerFn` is mocked to pass
 * handlers through as-is, so `exportAuditLogServerFn` is the real handler. The
 * `apiFetch` mock is path-aware — it returns the held capability set for the
 * `requireCapability` round-trip and a CSV `Response` for the export call, so we
 * exercise the real grant-scoping + streaming path.
 */
let heldCaps: string[] = [];

const mockApiFetchMock = jest.fn(async (path: string, _init?: RequestInit) => {
  if (path.includes('/grants/effective')) {
    return { ok: true, json: async () => ({ capabilities: heldCaps }) } as unknown as Response;
  }
  if (path.includes('/audit-log/export.csv')) {
    return new Response('Timestamp,Action\n2025-01-01T00:00:00Z,grant.assigned\n', {
      status: 200,
      headers: { 'Content-Type': 'text/csv' },
    });
  }
  throw new Error(`unexpected apiFetch path: ${path}`);
});

jest.mock('./utils/api', () => ({
  apiFetch: (path: string, init?: RequestInit) => mockApiFetchMock(path, init),
  extractApiError: jest.fn(async (_res: unknown, msg: string) => {
    throw new Error(msg);
  }),
}));

jest.mock('~/admin/query', () => ({
  queryOptions: (opts: unknown) => opts,
}));

import { exportAuditLogServerFn } from './capabilities';

describe('exportAuditLogServerFn', () => {
  beforeEach(() => {
    heldCaps = [];
    mockApiFetchMock.mockClear();
  });

  it('streams a grant-scoped text/csv attachment when authorized', async () => {
    heldCaps = [READ_AUDIT_LOG_CAPABILITY];

    const res = await exportAuditLogServerFn({ data: {} });

    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get('Content-Type')).toMatch(/text\/csv/);
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; filename="audit-log-/);

    const exportCall = mockApiFetchMock.mock.calls.find((c) => String(c[0]).includes('export.csv'));
    expect(exportCall?.[0]).toMatch(/category=grant/);

    // Body is piped through verbatim rather than buffered/re-serialized.
    expect(await res.text()).toContain('grant.assigned');
  });

  it('rejects when READ_AUDIT_LOG is not held', async () => {
    heldCaps = [];
    await expect(exportAuditLogServerFn({ data: {} })).rejects.toThrow();
    expect(mockApiFetchMock.mock.calls.some((c) => String(c[0]).includes('export.csv'))).toBe(
      false,
    );
  });
});
