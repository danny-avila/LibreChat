const rateLimit = require('express-rate-limit');
const { limiterCache } = require('@librechat/api');
const { ErrorTypes, ViolationTypes } = require('librechat-data-provider');
const { removePorts } = require('~/server/utils');
const { logViolation } = require('~/cache');

const { LOGIN_WINDOW = 5, LOGIN_MAX = 7, LOGIN_VIOLATION_SCORE: score } = process.env;
const windowMs = LOGIN_WINDOW * 60 * 1000;
const max = LOGIN_MAX;
const windowInMinutes = windowMs / 60000;
const message = `Too many login attempts, please try again after ${windowInMinutes} minutes.`;

/**
 * `/oauth/*` 는 브라우저 최상위 내비게이션이라 JSON 을 돌려주면 화면에 원문이
 * 그대로 찍힌다. 로그인 화면으로 돌려보내 토스트로 안내한다.
 *
 * `redirect=false` 를 빼면 OPENID_AUTO_REDIRECT 가 켜진 환경에서 로그인 화면이
 * 즉시 다시 IdP 로 튕겨 429 루프가 된다.
 */
const oauthRateLimitRedirect = `${process.env.DOMAIN_CLIENT ?? ''}/login?redirect=false&error=${ErrorTypes.LOGIN_RATE_LIMITED}`;

const handler = async (req, res) => {
  const type = ViolationTypes.LOGINS;
  const errorMessage = {
    type,
    max,
    windowInMinutes,
  };

  await logViolation(req, res, type, errorMessage, score);
  if (req.baseUrl === '/oauth') {
    return res.redirect(oauthRateLimitRedirect);
  }
  return res.status(429).json({ message });
};

const limiterOptions = {
  windowMs,
  max,
  handler,
  keyGenerator: removePorts,
  store: limiterCache('login_limiter'),
};

const loginLimiter = rateLimit(limiterOptions);

module.exports = loginLimiter;
