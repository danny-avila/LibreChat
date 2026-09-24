import { USAGE_MAX_RANGE_DAYS, USAGE_MAX_ROWS } from 'librechat-data-provider';
import type { MonthlyUsageResult } from '@librechat/data-schemas';
import type { TUsageTotals } from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';

import { createAdminUsageHandlers } from './usage';

type UsageQuery = {
  from?: string;
  to?: string;
  timeZone?: string;
  userId?: string;
};

type MonthlyArgs = {
  from: Date;
  to: Date;
  timeZone?: string;
  tenantId?: string;
  userId?: string;
  limit?: number;
};

type TotalsArgs = Omit<MonthlyArgs, 'limit'>;

const emptyTotals = (): TUsageTotals => ({
  credits: 0,
  tokens: 0,
  transactions: 0,
  models: [],
  byMonth: [],
  byRole: [],
  byUser: [],
});

const emptyMonthly = (): MonthlyUsageResult => ({ rows: [], capped: false });

function mockReq(query: UsageQuery = {}) {
  return {
    user: { id: 'u1', role: 'ADMIN', tenantId: 't1' },
    params: {},
    body: {},
    query,
  } as Partial<ServerRequest> as ServerRequest;
}

interface MockRes {
  statusCode: number;
  body: undefined | Record<string, unknown>;
  status: jest.Mock;
  json: jest.Mock;
}

function mockRes() {
  const res: MockRes = {
    statusCode: 200,
    body: undefined,
    status: jest.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn((data: MockRes['body']) => {
      res.body = data;
      return res;
    }),
  };
  return res as Partial<Response> as Response & MockRes;
}

function handlers(
  overrides: {
    getMonthlyUsage?: (options: MonthlyArgs) => Promise<MonthlyUsageResult>;
    getUsageTotals?: (options: TotalsArgs) => Promise<TUsageTotals>;
  } = {},
) {
  const monthlyCalls: MonthlyArgs[] = [];
  const totalsCalls: TotalsArgs[] = [];

  const deps = {
    getMonthlyUsage: async (options: MonthlyArgs) => {
      monthlyCalls.push(options);
      return overrides.getMonthlyUsage ? await overrides.getMonthlyUsage(options) : emptyMonthly();
    },
    getUsageTotals: async (options: TotalsArgs) => {
      totalsCalls.push(options);
      return overrides.getUsageTotals ? await overrides.getUsageTotals(options) : emptyTotals();
    },
  };

  return { ...createAdminUsageHandlers(deps), monthlyCalls, totalsCalls };
}

describe('createAdminUsageHandlers', () => {
  it('defaults the range to the current calendar month in the requested time zone', async () => {
    const { getUsage, monthlyCalls, totalsCalls } = handlers();
    const res = mockRes();

    await getUsage(mockReq({ timeZone: 'America/Bogota' }), res);

    expect(res.statusCode).toBe(200);
    const [monthly] = monthlyCalls;
    expect(monthly.timeZone).toBe('America/Bogota');
    expect(monthly.from.toISOString()).toMatch(/-01T05:00:00\.000Z$/);
    expect(monthly.to.getTime()).toBeLessThanOrEqual(Date.now());
    expect(totalsCalls[0].timeZone).toBe('America/Bogota');
  });

  it('passes the same range, tenant and user to both rollups', async () => {
    const { getUsage, monthlyCalls, totalsCalls } = handlers();
    const res = mockRes();
    const userId = '507f1f77bcf86cd799439011';

    await getUsage(
      mockReq({ from: '2026-01-01T00:00:00.000Z', to: '2026-01-31T23:59:59.000Z', userId }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(monthlyCalls[0]).toMatchObject({ tenantId: 't1', userId, limit: USAGE_MAX_ROWS });
    expect(totalsCalls[0]).toMatchObject({ tenantId: 't1', userId });
    expect(totalsCalls[0].from.toISOString()).toBe(monthlyCalls[0].from.toISOString());
    expect(totalsCalls[0].to.toISOString()).toBe(monthlyCalls[0].to.toISOString());
  });

  it('resolves bare calendar days to whole zoned days, not UTC midnight', async () => {
    const { getUsage, monthlyCalls } = handlers();
    const res = mockRes();

    await getUsage(
      mockReq({ from: '2026-01-01', to: '2026-01-31', timeZone: 'America/Bogota' }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(monthlyCalls[0].from.toISOString()).toBe('2026-01-01T05:00:00.000Z');
    expect(monthlyCalls[0].to.toISOString()).toBe('2026-02-01T04:59:59.999Z');
  });

  it('reports the row cap alongside the rollups', async () => {
    const { getUsage } = handlers({
      getMonthlyUsage: async () => ({
        capped: true,
        rows: [
          {
            userId: 'u9',
            name: 'Nine',
            email: 'nine@example.com',
            role: 'BUILDER',
            model: 'gpt-4o',
            month: '2026-01',
            credits: 1200,
            tokens: 400,
            transactions: 3,
          },
        ],
      }),
      getUsageTotals: async () => ({
        credits: 1200,
        tokens: 400,
        transactions: 3,
        models: [{ model: 'gpt-4o', credits: 1200, tokens: 400, transactions: 3 }],
        byMonth: [{ month: '2026-01', credits: 1200, tokens: 400, transactions: 3 }],
        byRole: [{ role: 'BUILDER', users: 1, credits: 1200, tokens: 400, transactions: 3 }],
        byUser: [
          {
            userId: 'u9',
            name: 'Nine',
            email: 'nine@example.com',
            role: 'BUILDER',
            credits: 1200,
            tokens: 400,
            transactions: 3,
          },
        ],
      }),
    });
    const res = mockRes();

    await getUsage(
      mockReq({ from: '2026-01-01T00:00:00.000Z', to: '2026-01-31T00:00:00.000Z' }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      rowsCapped: true,
      rowLimit: USAGE_MAX_ROWS,
      timeZone: 'UTC',
    });
    expect(res.body?.totals).toMatchObject({ credits: 1200 });
    expect((res.body?.totals as TUsageTotals).byUser).toEqual([
      {
        userId: 'u9',
        name: 'Nine',
        email: 'nine@example.com',
        role: 'BUILDER',
        credits: 1200,
        tokens: 400,
        transactions: 3,
      },
    ]);
  });

  it('rejects a malformed user id before touching the database', async () => {
    const { getUsage, monthlyCalls } = handlers();
    const res = mockRes();

    await getUsage(mockReq({ userId: 'not-an-id' }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid user ID format' });
    expect(monthlyCalls).toHaveLength(0);
  });

  it('rejects an unparseable or inverted range', async () => {
    const { getUsage } = handlers();
    const badFrom = mockRes();
    await getUsage(mockReq({ from: 'yesterday' }), badFrom);
    expect(badFrom.statusCode).toBe(400);
    expect(badFrom.body).toEqual({ error: 'Query parameter "from" is not a valid date' });

    const inverted = mockRes();
    await getUsage(
      mockReq({ from: '2026-02-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' }),
      inverted,
    );
    expect(inverted.statusCode).toBe(400);
    expect(inverted.body).toEqual({ error: 'Query parameter "from" must precede "to"' });
  });

  it('rejects a range wider than the cap and names the cap', async () => {
    const { getUsage, monthlyCalls } = handlers();
    const res = mockRes();

    await getUsage(
      mockReq({ from: '2024-01-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: `Range must not exceed ${USAGE_MAX_RANGE_DAYS} days` });
    expect(monthlyCalls).toHaveLength(0);
  });

  it('answers 500 without leaking the driver error', async () => {
    const { getUsage } = handlers({
      getUsageTotals: async () => {
        throw new Error('ns not found: librechat.transactions');
      },
    });
    const res = mockRes();

    await getUsage(mockReq(), res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to read usage' });
  });
});
