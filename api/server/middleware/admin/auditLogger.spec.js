jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

const mongoose = require('mongoose');
const { EventEmitter } = require('events');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Build a self-contained AdminAuditLog model that mirrors the real schema's
// shape. We can't import `packages/data-schemas/src/schema/adminAuditLog.ts`
// directly (no TS transformer in api/jest), and we can't import
// `~/db/models` (its data-schemas bundle conflicts with the global winston
// mock at module-load time). The real schema's behavior is exercised by
// integration tests run against the production data-schemas bundle.
jest.mock('~/db/models', () => {
  const m = require('mongoose');
  const schema = new m.Schema(
    {
      actorId: { type: m.Schema.Types.ObjectId, required: true },
      actorEmail: { type: String, required: true },
      actorIp: String,
      userAgent: String,
      action: { type: String, required: true },
      targetType: { type: String, required: true },
      targetId: String,
      before: m.Schema.Types.Mixed,
      after: m.Schema.Types.Mixed,
      meta: m.Schema.Types.Mixed,
      reason: String,
      status: { type: String, required: true, default: 'success' },
      errorMessage: String,
    },
    { timestamps: { createdAt: true, updatedAt: false } },
  );
  const AdminAuditLog = m.models.AdminAuditLog || m.model('AdminAuditLog', schema);
  return { AdminAuditLog };
});

const { AdminAuditLog } = require('~/db/models');

const auditLogger = require('./auditLogger');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await AdminAuditLog.deleteMany({});
});

function makeReq({
  userId = new mongoose.Types.ObjectId(),
  email = 'admin@example.com',
  ip = '203.0.113.10',
  ua = 'jest/1.0',
  body = {},
} = {}) {
  return {
    user: { _id: userId, id: userId.toString(), email },
    ip,
    headers: { 'user-agent': ua },
    body,
  };
}

function makeRes(statusCode = 200) {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  res.json = jest.fn(function (body) {
    res._body = body;
    return res;
  });
  res.send = jest.fn(function (body) {
    res._body = body;
    return res;
  });
  return res;
}

async function flushFinish(res, { expectRow = true } = {}) {
  res.emit('finish');
  // Wait for the async AdminAuditLog.create() inside the finish handler to
  // settle. Poll up to ~1s; for negative-path tests pass expectRow:false.
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setImmediate(r));
    if (!expectRow) break;
    const count = await AdminAuditLog.estimatedDocumentCount();
    if (count > 0) return;
  }
}

describe('auditLogger', () => {
  it('writes a success row on 2xx', async () => {
    const mw = auditLogger('REAUTH', { targetType: 'system' });
    const req = makeReq();
    const res = makeRes(200);
    const next = jest.fn();
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
    res.json({ ok: true });
    await flushFinish(res);

    const rows = await AdminAuditLog.find({}).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('success');
    expect(rows[0].action).toBe('REAUTH');
    expect(rows[0].targetType).toBe('system');
    expect(rows[0].actorEmail).toBe('admin@example.com');
    expect(rows[0].actorIp).toBe('203.0.113.10');
    expect(rows[0].userAgent).toBe('jest/1.0');
  });

  it('writes a failure row on 4xx', async () => {
    const mw = auditLogger('REAUTH', { targetType: 'system' });
    const req = makeReq();
    const res = makeRes(401);
    mw(req, res, jest.fn());
    res.json({ message: 'Invalid credentials' });
    await flushFinish(res);

    const rows = await AdminAuditLog.find({}).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('failure');
    expect(rows[0].errorMessage).toBe('Invalid credentials');
  });

  it('writes a failure row on 5xx', async () => {
    const mw = auditLogger('REAUTH', { targetType: 'system' });
    const req = makeReq();
    const res = makeRes(500);
    mw(req, res, jest.fn());
    res.json({ message: 'oops' });
    await flushFinish(res);

    const rows = await AdminAuditLog.find({}).lean();
    expect(rows[0].status).toBe('failure');
    expect(rows[0].errorMessage).toBe('oops');
  });

  it('does not throw when DB write fails', async () => {
    const spy = jest.spyOn(AdminAuditLog, 'create').mockRejectedValueOnce(new Error('boom'));
    const mw = auditLogger('REAUTH', { targetType: 'system' });
    const req = makeReq();
    const res = makeRes(200);
    mw(req, res, jest.fn());
    res.json({ ok: 1 });
    await expect(
      (async () => {
        await flushFinish(res);
      })(),
    ).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it('captures actorId, actorEmail, actorIp, userAgent', async () => {
    const userId = new mongoose.Types.ObjectId();
    const mw = auditLogger('REAUTH', { targetType: 'system' });
    const req = makeReq({ userId, email: 'foo@bar.com', ip: '1.1.1.1', ua: 'agent/9' });
    const res = makeRes(200);
    mw(req, res, jest.fn());
    res.json({ ok: 1 });
    await flushFinish(res);
    const row = await AdminAuditLog.findOne({}).lean();
    expect(row.actorId.toString()).toBe(userId.toString());
    expect(row.actorEmail).toBe('foo@bar.com');
    expect(row.actorIp).toBe('1.1.1.1');
    expect(row.userAgent).toBe('agent/9');
  });

  it('calls getTargetId, getBefore, getAfter, getMeta, getReason', async () => {
    const getTargetId = jest.fn(() => 'target-1');
    const getBefore = jest.fn(() => ({ a: 1 }));
    const getAfter = jest.fn(() => ({ a: 2 }));
    const getMeta = jest.fn(() => ({ trace: 'abc' }));
    const getReason = jest.fn(() => 'because');

    const mw = auditLogger('USER_BAN', {
      targetType: 'user',
      getTargetId,
      getBefore,
      getAfter,
      getMeta,
      getReason,
    });
    const req = makeReq();
    const res = makeRes(200);
    mw(req, res, jest.fn());
    res.json({ ok: 1 });
    await flushFinish(res);

    expect(getTargetId).toHaveBeenCalled();
    expect(getBefore).toHaveBeenCalled();
    expect(getAfter).toHaveBeenCalled();
    expect(getMeta).toHaveBeenCalled();
    expect(getReason).toHaveBeenCalled();

    const row = await AdminAuditLog.findOne({}).lean();
    expect(row.targetId).toBe('target-1');
    expect(row.before).toEqual({ a: 1 });
    expect(row.after).toEqual({ a: 2 });
    expect(row.meta).toEqual({ trace: 'abc' });
    expect(row.reason).toBe('because');
  });
});
