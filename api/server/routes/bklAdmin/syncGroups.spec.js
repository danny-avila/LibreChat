const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('~/server/services/Config/app');
jest.mock('~/server/services/bklSso', () => ({ persistBklFields: jest.fn() }));

const { persistBklFields } = require('~/server/services/bklSso');

const TEST_BASE = 'https://nbtest.bkl.co.kr/mentat-api/api/mentat';

const orgRow = (sid) => [
  { sid, groupSid: 331, groupName: '규제그룹(04)', divSid: 328, divName: '범자문그룹(01)' },
];

/**
 * POST /admin-api/users/sync-groups — 조직 정보 일괄 채우기.
 *
 * 조직 API 는 배치 조회가 없어 사용자당 1콜이다. 전체를 한 번에 돌리면
 * 요청이 길어지므로 limit 으로 끊고 remaining 을 돌려주는 것이 핵심이다.
 */
describe('POST /users/sync-groups', () => {
  let mongoServer;
  let app;
  let users;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    app = express();
    app.use(express.json());
    app.use(require('./sessions'));
    users = mongoose.connection.db.collection('users');
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await users.deleteMany({});
    process.env.BIMS_ORG_BASE = TEST_BASE;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete process.env.BIMS_ORG_BASE;
  });

  const seedUsers = (count, extra = {}) =>
    users.insertMany(
      Array.from({ length: count }, (_, i) => ({
        email: `u${i}@bkl.co.kr`,
        bkl_sid: 100000 + i,
        ...extra,
      })),
    );

  test('BIMS_ORG_BASE 미설정이면 안내만 반환하고 호출하지 않는다', async () => {
    delete process.env.BIMS_ORG_BASE;
    await seedUsers(3);

    const res = await request(app).post('/users/sync-groups').send({});

    expect(res.status).toBe(200);
    expect(res.body.synced).toBe(0);
    expect(res.body.message).toMatch(/BIMS_ORG_BASE/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('대상 사용자마다 1콜씩 조회해 채운다', async () => {
    await seedUsers(3);
    global.fetch.mockImplementation(async (url) => ({
      ok: true,
      status: 200,
      json: async () => orgRow(Number(url.split('/').pop())),
    }));

    const res = await request(app).post('/users/sync-groups').send({});

    expect(res.body).toMatchObject({ processed: 3, synced: 3, empty: 0, failed: 0 });
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(persistBklFields).toHaveBeenCalledTimes(3);
  });

  test('sid 가 없는 사용자는 대상이 아니다', async () => {
    await users.insertMany([
      { email: 'nosid@bkl.co.kr' },
      { email: 'nullsid@bkl.co.kr', bkl_sid: null },
    ]);

    const res = await request(app).post('/users/sync-groups').send({});

    expect(res.body.synced).toBe(0);
    expect(res.body.message).toMatch(/동기화할 사용자가 없습니다/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('최근 동기화된 사용자는 건너뛴다', async () => {
    await seedUsers(2, { bkl_org_synced_at: new Date() });

    const res = await request(app).post('/users/sync-groups').send({});

    expect(res.body.synced).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  /** limit 으로 끊고 남은 수를 알려줘야 운영자가 이어서 진행할 수 있다. */
  test('limit 만큼만 처리하고 remaining 을 알려준다', async () => {
    await seedUsers(5);
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => orgRow(1) });
    // persistBklFields 를 모킹했으므로 타임스탬프가 실제로 남지 않는다 →
    // remaining 은 전체 건수가 그대로 유지된다. limit 동작만 검증한다.

    const res = await request(app).post('/users/sync-groups').send({ limit: 2 });

    expect(res.body.processed).toBe(2);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(res.body.remaining).toBe(5);
  });

  test('일부 실패를 집계하고 오류 예시를 돌려준다', async () => {
    await seedUsers(3);
    let call = 0;
    global.fetch.mockImplementation(async () => {
      call += 1;
      if (call === 2) {
        return { ok: false, status: 307, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => orgRow(1) };
    });

    const res = await request(app).post('/users/sync-groups').send({});

    expect(res.body).toMatchObject({ processed: 3, synced: 2, failed: 1 });
    expect(res.body.errors[0]).toMatch(/미개방|인증 필요/);
  });

  test('그룹이 없는 사용자는 empty 로 집계한다', async () => {
    await seedUsers(2);
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => [] });

    const res = await request(app).post('/users/sync-groups').send({});

    expect(res.body).toMatchObject({ synced: 0, empty: 2, failed: 0 });
  });
});
