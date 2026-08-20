const cookies = require('cookie');
const passport = require('passport');
const { isEnabled } = require('@librechat/api');

/**
 * /bkl 프록시 전용 JWT 미들웨어.
 *
 * optionalJwtAuth 와의 차이: Authorization 헤더가 실려 왔는데 검증에
 * 실패하면(만료 토큰이 대표적) 익명으로 조용히 통과시키지 않고 401 을
 * 돌려준다.
 *
 * 배경: optionalJwtAuth 는 만료 토큰을 익명 요청으로 통과시켜
 * X-BKL-User-Sid 가 주입되지 않고, bkl-api 가 403 "User identity
 * required" 를 반환한다. 클라이언트 전역 axios 인터셉터의 토큰 자동
 * 갱신은 401 에만 발동하므로(packages/data-provider/src/request.ts),
 * 프로젝트 페이지를 열어둔 채 토큰이 만료되면 갱신 대신 "sid 없는
 * 계정" 오류가 표시됐다. 401 을 돌려주면 인터셉터가 /api/auth/refresh
 * 후 원 요청을 재시도해 사용자는 아무것도 느끼지 못한다.
 *
 * Authorization 헤더가 아예 없는 요청은 기존처럼 익명 통과 — sid 가
 * 필요 없는 /bkl 경로와 서드파티 호출 형태를 깨지 않는다.
 */
const bklOptionalJwtAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const hasBearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ');

  const cookieHeader = req.headers.cookie;
  const tokenProvider = cookieHeader ? cookies.parse(cookieHeader).token_provider : null;

  const callback = (err, user) => {
    if (err) {
      return next(err);
    }
    if (user) {
      req.user = user;
      return next();
    }
    if (hasBearer) {
      return res.status(401).json({ message: 'Token expired or invalid' });
    }
    next();
  };

  if (tokenProvider === 'openid' && isEnabled(process.env.OPENID_REUSE_TOKENS)) {
    return passport.authenticate('openidJwt', { session: false }, callback)(req, res, next);
  }
  passport.authenticate('jwt', { session: false }, callback)(req, res, next);
};

module.exports = bklOptionalJwtAuth;
