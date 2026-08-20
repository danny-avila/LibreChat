const passport = require('passport');
const bklOptionalJwtAuth = require('./bklOptionalJwtAuth');

jest.mock('passport');
jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn(() => false),
}));

/**
 * /bkl 전용 JWT 미들웨어 테스트.
 *
 * 핵심 계약: Authorization 헤더가 있는데 검증 실패(만료 토큰)면 401 —
 * 익명으로 통과시키면 bkl-api 의 403 이 "sid 없는 계정" 오류로 잘못
 * 표시되고, 클라이언트 전역 인터셉터의 토큰 갱신(401 전용)이 발동하지
 * 않는다. 헤더가 없으면 기존 optionalJwtAuth 처럼 익명 통과.
 */
describe('bklOptionalJwtAuth middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  /** passport.authenticate 가 (err, user) 콜백으로 주어진 결과를 돌려주게 설정 */
  const authResult = (err, user) => {
    passport.authenticate.mockImplementation((_strategy, _opts, callback) => {
      return () => callback(err, user);
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = { headers: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
  });

  it('유효 토큰: req.user 를 채우고 통과', () => {
    mockReq.headers.authorization = 'Bearer valid-token';
    authResult(null, { id: 'u1' });

    bklOptionalJwtAuth(mockReq, mockRes, mockNext);

    expect(mockReq.user).toEqual({ id: 'u1' });
    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('만료/무효 토큰 (헤더 있음): 401 — 익명 통과 금지', () => {
    mockReq.headers.authorization = 'Bearer expired-token';
    authResult(null, false);

    bklOptionalJwtAuth(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ message: 'Token expired or invalid' });
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockReq.user).toBeUndefined();
  });

  it('Authorization 헤더 없음: 익명 통과 (기존 동작 유지)', () => {
    authResult(null, false);

    bklOptionalJwtAuth(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
    expect(mockReq.user).toBeUndefined();
  });

  it('Bearer 형식이 아닌 Authorization 헤더: 익명 통과', () => {
    mockReq.headers.authorization = 'Basic abc123';
    authResult(null, false);

    bklOptionalJwtAuth(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('전략 오류: next(err) 로 전달', () => {
    mockReq.headers.authorization = 'Bearer token';
    const boom = new Error('strategy failure');
    authResult(boom, null);

    bklOptionalJwtAuth(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith(boom);
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('openid 쿠키 + OPENID_REUSE_TOKENS: openidJwt 전략 사용', () => {
    const { isEnabled } = require('@librechat/api');
    isEnabled.mockReturnValue(true);
    mockReq.headers.cookie = 'token_provider=openid';
    mockReq.headers.authorization = 'Bearer t';
    authResult(null, { id: 'u2' });

    bklOptionalJwtAuth(mockReq, mockRes, mockNext);

    expect(passport.authenticate).toHaveBeenCalledWith(
      'openidJwt',
      { session: false },
      expect.any(Function),
    );
    expect(mockReq.user).toEqual({ id: 'u2' });
  });
});
