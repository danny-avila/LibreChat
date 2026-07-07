import { Types } from 'mongoose';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import type { AdminUsageDeps } from './usage';
import { createAdminUsageHandlers } from './usage';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

function createReqRes(query: Record<string, string> = {}) {
  const req = {
    query,
    params: {},
    body: {},
    user: { _id: new Types.ObjectId(), role: 'ADMIN' },
  } as unknown as ServerRequest;

  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;

  return { req, res, status, json };
}

describe('createAdminUsageHandlers', () => {
  function createHandlers(overrides: Partial<AdminUsageDeps> = {}) {
    const getUserUsageSummary = jest.fn().mockResolvedValue({ items: [], total: 0 });
    const deps: AdminUsageDeps = { getUserUsageSummary, ...overrides };
    return { handlers: createAdminUsageHandlers(deps), getUserUsageSummary };
  }

  describe('getUsageSummary', () => {
    it('parses pagination and returns the summary payload', async () => {
      const items = [
        {
          user: 'u1',
          name: 'Alice',
          email: 'alice@example.com',
          totalCost: 500,
          transactionCount: 3,
        },
      ];
      const { handlers, getUserUsageSummary } = createHandlers();
      getUserUsageSummary.mockResolvedValue({ items, total: 1 });
      const { req, res, status, json } = createReqRes({ limit: '10', offset: '0' });

      await handlers.getUsageSummary(req, res);

      expect(getUserUsageSummary).toHaveBeenCalledWith({
        startDate: undefined,
        endDate: undefined,
        limit: 10,
        offset: 0,
      });
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ items, total: 1, limit: 10, offset: 0 });
    });

    it('parses valid startDate/endDate query params into Date objects', async () => {
      const { handlers, getUserUsageSummary } = createHandlers();
      const { req, res } = createReqRes({ startDate: '2026-01-01', endDate: '2026-02-01' });

      await handlers.getUsageSummary(req, res);

      const callArgs = getUserUsageSummary.mock.calls[0][0];
      expect(callArgs.startDate).toBeInstanceOf(Date);
      expect(callArgs.endDate).toBeInstanceOf(Date);
    });

    it('ignores an invalid date string rather than passing an Invalid Date', async () => {
      const { handlers, getUserUsageSummary } = createHandlers();
      const { req, res } = createReqRes({ startDate: 'not-a-date' });

      await handlers.getUsageSummary(req, res);

      expect(getUserUsageSummary.mock.calls[0][0].startDate).toBeUndefined();
    });

    it('returns 500 when the aggregation throws', async () => {
      const { handlers, getUserUsageSummary } = createHandlers();
      getUserUsageSummary.mockRejectedValue(new Error('db down'));
      const { req, res, status, json } = createReqRes();

      await handlers.getUsageSummary(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to load usage summary' });
    });
  });
});
