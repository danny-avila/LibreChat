jest.mock('~/server/services/bklSso', () => ({ persistBklFields: jest.fn() }));

const { persistBklFields } = require('~/server/services/bklSso');
const {
  isOrgApiEnabled,
  parseOrgResponse,
  fetchUserOrg,
  needsOrgSync,
  orgSyncFilter,
  syncUserOrg,
  refreshUserOrgInBackground,
} = require('./bklOrg');

const TEST_BASE = 'https://nbtest.bkl.co.kr/mentat-api/api/mentat';

/** BKL 이 교차 검증한 실제 응답 형태. */
const ORG_ROW = {
  sid: 100078,
  groupSid: 331,
  groupName: '규제그룹(04)',
  divSid: 328,
  divName: '범자문그룹(01)',
  hqSid: 92,
  hqName: '전문가그룹',
};

const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });

describe('bklOrg', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.BIMS_ORG_BASE;
    delete process.env.BIMS_ORG_AUTH_HEADER;
    delete process.env.BIMS_ORG_AUTH_VALUE;
    delete process.env.BIMS_ORG_STALE_DAYS;
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('isOrgApiEnabled', () => {
    test('BIMS_ORG_BASE 미설정이면 비활성', () => {
      expect(isOrgApiEnabled()).toBe(false);
    });

    test('공백만 있으면 비활성', () => {
      process.env.BIMS_ORG_BASE = '   ';
      expect(isOrgApiEnabled()).toBe(false);
    });

    test('설정되면 활성', () => {
      process.env.BIMS_ORG_BASE = TEST_BASE;
      expect(isOrgApiEnabled()).toBe(true);
    });
  });

  describe('parseOrgResponse', () => {
    test('배열 응답에서 3단 계층을 뽑는다', () => {
      expect(parseOrgResponse([ORG_ROW])).toEqual({
        bkl_group_sid: 331,
        bkl_group_name: '규제그룹(04)',
        bkl_div_sid: 328,
        bkl_div_name: '범자문그룹(01)',
        bkl_hq_sid: 92,
        bkl_hq_name: '전문가그룹',
      });
    });

    test('{ data: [...] } 로 감싼 변형도 흡수한다', () => {
      expect(parseOrgResponse({ data: [ORG_ROW] })?.bkl_group_sid).toBe(331);
    });

    test('groupId 를 groupSid 별칭으로 받는다', () => {
      expect(parseOrgResponse([{ groupId: 405, groupName: '금융그룹' }])).toMatchObject({
        bkl_group_sid: 405,
        bkl_group_name: '금융그룹',
      });
    });

    test('그룹 식별 값이 없으면 null', () => {
      expect(parseOrgResponse([])).toBeNull();
      expect(parseOrgResponse([{ divName: '범자문그룹(01)' }])).toBeNull();
      expect(parseOrgResponse(null)).toBeNull();
      expect(parseOrgResponse({ data: 'nope' })).toBeNull();
    });

    test('빈 문자열은 null 로 정규화한다', () => {
      expect(parseOrgResponse([{ groupSid: 331, groupName: '  ', divName: '' }])).toMatchObject({
        bkl_group_name: null,
        bkl_div_name: null,
      });
    });
  });

  describe('fetchUserOrg', () => {
    beforeEach(() => {
      process.env.BIMS_ORG_BASE = TEST_BASE;
    });

    test('sid 로 조직 정보를 읽는다', async () => {
      global.fetch.mockResolvedValue(okResponse([ORG_ROW]));

      await expect(fetchUserOrg(100078)).resolves.toMatchObject({ bkl_group_sid: 331 });
      expect(global.fetch).toHaveBeenCalledWith(
        `${TEST_BASE}/User/group/100078`,
        expect.objectContaining({ redirect: 'manual' }),
      );
    });

    test('base URL 끝의 슬래시를 정리한다', async () => {
      process.env.BIMS_ORG_BASE = `${TEST_BASE}//`;
      global.fetch.mockResolvedValue(okResponse([ORG_ROW]));

      await fetchUserOrg(1);
      expect(global.fetch).toHaveBeenCalledWith(`${TEST_BASE}/User/group/1`, expect.anything());
    });

    test('인증 헤더가 설정되면 함께 보낸다', async () => {
      process.env.BIMS_ORG_AUTH_HEADER = 'Authorization';
      process.env.BIMS_ORG_AUTH_VALUE = 'Bearer tok';
      global.fetch.mockResolvedValue(okResponse([ORG_ROW]));

      await fetchUserOrg(1);
      expect(global.fetch.mock.calls[0][1].headers).toMatchObject({
        Authorization: 'Bearer tok',
      });
    });

    test('헤더 이름만 있으면 보내지 않는다', async () => {
      process.env.BIMS_ORG_AUTH_HEADER = 'Authorization';
      global.fetch.mockResolvedValue(okResponse([ORG_ROW]));

      await fetchUserOrg(1);
      expect(global.fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
    });

    /**
     * 운영은 미개방 상태에서 Azure AD 로그인으로 307 을 돌려준다.
     * 따라가면 HTML 을 JSON 으로 파싱하려다 엉뚱한 오류가 나므로,
     * 리다이렉트 자체를 "미개방" 으로 보고해야 한다.
     */
    test('리다이렉트는 미개방으로 보고한다', async () => {
      global.fetch.mockResolvedValue({ ok: false, status: 307, json: async () => ({}) });

      await expect(fetchUserOrg(1)).rejects.toThrow(/미개방|인증 필요/);
    });

    test('4xx/5xx 는 오류로 올린다', async () => {
      global.fetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });

      await expect(fetchUserOrg(1)).rejects.toThrow('HTTP 404');
    });

    test('BIMS_ORG_BASE 미설정이면 호출하지 않는다', async () => {
      delete process.env.BIMS_ORG_BASE;

      await expect(fetchUserOrg(1)).rejects.toThrow('BIMS_ORG_BASE 미설정');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('needsOrgSync', () => {
    test('sid 가 없으면 조회 불가', () => {
      expect(needsOrgSync({ bkl_group_sid: null })).toBe(false);
      expect(needsOrgSync(null)).toBe(false);
    });

    test('조직 정보가 없으면 필요', () => {
      expect(needsOrgSync({ bkl_sid: 1 })).toBe(true);
    });

    test('최근에 동기화했으면 불필요', () => {
      expect(needsOrgSync({ bkl_sid: 1, bkl_group_sid: 331, bkl_org_synced_at: new Date() })).toBe(
        false,
      );
    });

    test('만료됐으면 필요', () => {
      const old = new Date(Date.now() - 31 * 24 * 3600 * 1000);
      expect(needsOrgSync({ bkl_sid: 1, bkl_group_sid: 331, bkl_org_synced_at: old })).toBe(true);
    });

    test('BIMS_ORG_STALE_DAYS 를 따른다', () => {
      process.env.BIMS_ORG_STALE_DAYS = '1';
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000);
      expect(needsOrgSync({ bkl_sid: 1, bkl_group_sid: 331, bkl_org_synced_at: twoDaysAgo })).toBe(
        true,
      );
    });
  });

  describe('orgSyncFilter', () => {
    test('sid 가 숫자인 사용자 중 미동기화/만료만 고른다', () => {
      const filter = orgSyncFilter();

      expect(filter.bkl_sid).toEqual({ $type: 'number' });
      expect(filter.$or).toHaveLength(2);
      expect(filter.$or[0]).toEqual({ bkl_org_synced_at: { $exists: false } });
      expect(filter.$or[1].bkl_org_synced_at.$lt).toBeInstanceOf(Date);
    });
  });

  describe('syncUserOrg', () => {
    beforeEach(() => {
      process.env.BIMS_ORG_BASE = TEST_BASE;
    });

    test('조직 정보와 타임스탬프를 저장한다', async () => {
      global.fetch.mockResolvedValue(okResponse([ORG_ROW]));

      await expect(syncUserOrg('u1', 100078)).resolves.toBe(true);
      expect(persistBklFields).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({
          bkl_group_sid: 331,
          bkl_group_name: '규제그룹(04)',
          bkl_org_synced_at: expect.any(Date),
        }),
      );
    });

    /** 그룹이 없는 사용자를 매번 다시 조회하지 않도록 타임스탬프는 남긴다. */
    test('그룹이 비어도 타임스탬프는 갱신한다', async () => {
      global.fetch.mockResolvedValue(okResponse([]));

      await expect(syncUserOrg('u1', 1)).resolves.toBe(false);
      expect(persistBklFields).toHaveBeenCalledWith('u1', {
        bkl_org_synced_at: expect.any(Date),
      });
    });

    test('조회 실패는 올린다 (타임스탬프를 남기지 않아 다음에 재시도)', async () => {
      global.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

      await expect(syncUserOrg('u1', 1)).rejects.toThrow('HTTP 500');
      expect(persistBklFields).not.toHaveBeenCalled();
    });
  });

  describe('refreshUserOrgInBackground', () => {
    const flush = () => new Promise((resolve) => setImmediate(resolve));

    test('비활성 상태면 아무 것도 하지 않는다', async () => {
      refreshUserOrgInBackground({ _id: 'u1', bkl_sid: 1 });
      await flush();

      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('최근 동기화된 사용자는 건너뛴다', async () => {
      process.env.BIMS_ORG_BASE = TEST_BASE;
      refreshUserOrgInBackground({
        _id: 'u1',
        bkl_sid: 1,
        bkl_group_sid: 331,
        bkl_org_synced_at: new Date(),
      });
      await flush();

      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('필요한 사용자는 갱신한다', async () => {
      process.env.BIMS_ORG_BASE = TEST_BASE;
      global.fetch.mockResolvedValue(okResponse([ORG_ROW]));

      refreshUserOrgInBackground({ _id: 'u1', bkl_sid: 100078 });
      await flush();
      await flush();

      expect(persistBklFields).toHaveBeenCalled();
    });

    /** 조직 정보를 못 가져왔다고 로그인을 막을 이유가 없다. */
    test('실패해도 예외를 던지지 않는다', async () => {
      process.env.BIMS_ORG_BASE = TEST_BASE;
      global.fetch.mockRejectedValue(new Error('network down'));

      expect(() => refreshUserOrgInBackground({ _id: 'u1', bkl_sid: 1 })).not.toThrow();
      await flush();
      await flush();

      expect(persistBklFields).not.toHaveBeenCalled();
    });
  });
});
