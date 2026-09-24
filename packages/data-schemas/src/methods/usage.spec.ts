import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createUsageMethods } from './usage';
import { createModels } from '~/models';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: InstanceType<typeof MongoMemoryServer>;
let methods: ReturnType<typeof createUsageMethods>;

const ada = new mongoose.Types.ObjectId();
const grace = new mongoose.Types.ObjectId();
const ghost = new mongoose.Types.ObjectId();

/** Spend is written as a negative delta, which is exactly what the rollup must read back. */
const spend = (user: mongoose.Types.ObjectId, model: string, createdAt: string, cost: number) => ({
  user,
  model,
  tokenType: 'completion',
  rawAmount: -100,
  tokenValue: -cost,
  createdAt: new Date(createdAt),
  updatedAt: new Date(createdAt),
});

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  methods = createUsageMethods(mongoose);

  await mongoose.models.User.insertMany([
    { _id: ada, name: 'Ada', email: 'ada@example.com', role: 'BUILDER' },
    { _id: grace, name: 'Grace', email: 'grace@example.com', role: 'USER' },
  ]);

  await mongoose.models.Transaction.insertMany([
    spend(ada, 'gpt-4o', '2026-01-10T12:00:00Z', 500),
    spend(ada, 'gpt-4o', '2026-02-10T12:00:00Z', 300),
    spend(ada, 'claude-opus', '2026-02-11T12:00:00Z', 900),
    spend(grace, 'gpt-4o', '2026-01-20T12:00:00Z', 200),
    spend(ghost, 'gpt-4o', '2026-01-21T12:00:00Z', 50),
    {
      ...spend(ada, 'gpt-4o', '2026-01-15T12:00:00Z', 10_000),
      tokenType: 'credits',
    },
    {
      ...spend(ada, 'gpt-4o', '2025-12-31T12:00:00Z', 7_777),
    },
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

const range = { from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-02-28T23:59:59Z') };

describe('getUsageTotals', () => {
  it('sums spend as a magnitude and leaves credit grants out of it', async () => {
    const totals = await methods.getUsageTotals(range);

    expect(totals.credits).toBe(1950);
    expect(totals.transactions).toBe(5);
    expect(totals.tokens).toBe(500);
  });

  it('buckets months in the requested time zone', async () => {
    const utc = await methods.getUsageTotals({ ...range, timeZone: 'UTC' });
    expect(utc.byMonth).toEqual([
      { month: '2026-01', credits: 750, tokens: 300, transactions: 3 },
      { month: '2026-02', credits: 1200, tokens: 200, transactions: 2 },
    ]);

    const tokyo = await methods.getUsageTotals({
      ...range,
      from: new Date('2026-01-31T16:00:00Z'),
      to: new Date('2026-02-01T12:00:00Z'),
      timeZone: 'Asia/Tokyo',
    });
    expect(tokyo.byMonth).toEqual([]);
  });

  it('counts distinct users per role and keeps unknown owners separate', async () => {
    const totals = await methods.getUsageTotals(range);

    expect(totals.byRole).toEqual([
      { role: 'BUILDER', users: 1, credits: 1700, tokens: 300, transactions: 3 },
      { role: 'USER', users: 1, credits: 200, tokens: 100, transactions: 1 },
      { role: '', users: 1, credits: 50, tokens: 100, transactions: 1 },
    ]);
  });

  it('breaks spend down per model, biggest first', async () => {
    const totals = await methods.getUsageTotals(range);

    expect(totals.models).toEqual([
      { model: 'gpt-4o', credits: 1050, tokens: 400, transactions: 4 },
      { model: 'claude-opus', credits: 900, tokens: 100, transactions: 1 },
    ]);
  });

  it('answers zeroed totals rather than throwing on an empty range', async () => {
    const totals = await methods.getUsageTotals({
      from: new Date('2030-01-01T00:00:00Z'),
      to: new Date('2030-01-31T00:00:00Z'),
    });

    expect(totals).toEqual({
      credits: 0,
      tokens: 0,
      transactions: 0,
      models: [],
      byMonth: [],
      byRole: [],
      byUser: [],
    });
  });
});

describe('getUsageTotals byUser', () => {
  it('sums every bucket a user touched and joins their identity, biggest spender first', async () => {
    const { byUser } = await methods.getUsageTotals(range);

    expect(byUser).toEqual([
      {
        userId: ada.toString(),
        name: 'Ada',
        email: 'ada@example.com',
        role: 'BUILDER',
        credits: 1700,
        tokens: 300,
        transactions: 3,
      },
      {
        userId: grace.toString(),
        name: 'Grace',
        email: 'grace@example.com',
        role: 'USER',
        credits: 200,
        tokens: 100,
        transactions: 1,
      },
      {
        userId: ghost.toString(),
        name: '',
        email: '',
        role: '',
        credits: 50,
        tokens: 100,
        transactions: 1,
      },
    ]);
  });

  it('adds up to the overall total and to the per-role rollup', async () => {
    const totals = await methods.getUsageTotals(range);
    const summed = totals.byUser.reduce((running, entry) => running + entry.credits, 0);

    expect(summed).toBe(totals.credits);
    expect(totals.byUser).toHaveLength(
      totals.byRole.reduce((running, entry) => running + entry.users, 0),
    );
  });

  it('keeps the highest spenders when the user limit bites', async () => {
    const { byUser } = await methods.getUsageTotals({ ...range, userLimit: 2 });

    expect(byUser.map((entry) => entry.userId)).toEqual([ada.toString(), grace.toString()]);
    expect(byUser.map((entry) => entry.credits)).toEqual([1700, 200]);
  });

  it('narrows to a single spender when a user is requested', async () => {
    const { byUser } = await methods.getUsageTotals({ ...range, userId: grace.toString() });

    expect(byUser).toEqual([
      {
        userId: grace.toString(),
        name: 'Grace',
        email: 'grace@example.com',
        role: 'USER',
        credits: 200,
        tokens: 100,
        transactions: 1,
      },
    ]);
  });

  it('is unaffected when the row cap truncates getMonthlyUsage', async () => {
    const capped = await methods.getMonthlyUsage({ ...range, limit: 2 });
    expect(capped.capped).toBe(true);

    const foldedFromRows = new Map<string, number>();
    for (const row of capped.rows) {
      foldedFromRows.set(row.userId, (foldedFromRows.get(row.userId) ?? 0) + row.credits);
    }
    expect(foldedFromRows.get(ada.toString())).toBe(1400);
    expect(foldedFromRows.has(grace.toString())).toBe(false);

    const { byUser } = await methods.getUsageTotals(range);
    const server = new Map(byUser.map((entry) => [entry.userId, entry.credits]));

    expect(server.get(ada.toString())).toBe(1700);
    expect(server.get(grace.toString())).toBe(200);
    expect(server.get(ghost.toString())).toBe(50);
  });
});

describe('getMonthlyUsage', () => {
  it('joins the identity and role onto every bucket', async () => {
    const { rows, capped } = await methods.getMonthlyUsage(range);

    expect(capped).toBe(false);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({
      userId: ada.toString(),
      name: 'Ada',
      email: 'ada@example.com',
      role: 'BUILDER',
      model: 'claude-opus',
      month: '2026-02',
      credits: 900,
      tokens: 100,
      transactions: 1,
    });
    expect(rows.find((row) => row.userId === ghost.toString())).toMatchObject({
      name: '',
      email: '',
      role: '',
    });
  });

  it('keeps the highest-spend buckets when the cap bites, and says so', async () => {
    const { rows, capped } = await methods.getMonthlyUsage({ ...range, limit: 2 });

    expect(capped).toBe(true);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.credits)).toEqual([900, 500]);
  });

  it('does not report a cap when the result lands exactly on the limit', async () => {
    const { rows, capped } = await methods.getMonthlyUsage({ ...range, limit: 5 });

    expect(capped).toBe(false);
    expect(rows).toHaveLength(5);
  });

  it('narrows to a single user when asked', async () => {
    const { rows } = await methods.getMonthlyUsage({ ...range, userId: grace.toString() });

    expect(rows).toEqual([
      {
        userId: grace.toString(),
        name: 'Grace',
        email: 'grace@example.com',
        role: 'USER',
        model: 'gpt-4o',
        month: '2026-01',
        credits: 200,
        tokens: 100,
        transactions: 1,
      },
    ]);
  });
});
