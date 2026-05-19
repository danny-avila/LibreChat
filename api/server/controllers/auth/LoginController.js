const { trace, SpanStatusCode, metrics } = require('@opentelemetry/api');
const { logger } = require('@librechat/data-schemas');
const { generate2FATempToken } = require('~/server/services/twoFactorService');
const { setAuthTokens } = require('~/server/services/AuthService');

const tracer = trace.getTracer('billechat-api');
const meter = metrics.getMeter('billechat-api');
const loginCounter = meter.createCounter('auth.login', { description: 'Login attempts' });

const loginController = async (req, res) => {
  return tracer.startActiveSpan('auth.login', async (span) => {
    try {
      if (!req.user) {
        span.setAttributes({ 'auth.result': 'invalid_credentials' });
        loginCounter.add(1, { result: 'invalid_credentials' });
        span.end();
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      if (req.user.twoFactorEnabled) {
        const tempToken = generate2FATempToken(req.user._id);
        span.setAttributes({ 'auth.result': '2fa_pending' });
        loginCounter.add(1, { result: '2fa_pending' });
        span.end();
        return res.status(200).json({ twoFAPending: true, tempToken });
      }

      const { password: _p, totpSecret: _t, __v, ...user } = req.user;
      user.id = user._id.toString();

      const token = await setAuthTokens(req.user._id, res, null, req);

      span.setAttributes({ 'auth.result': 'success' });
      loginCounter.add(1, { result: 'success' });
      span.end();
      return res.status(200).send({ token, user });
    } catch (err) {
      logger.error('[loginController]', err);
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR });
      loginCounter.add(1, { result: 'error' });
      span.end();
      return res.status(500).json({ message: 'Something went wrong' });
    }
  });
};

module.exports = {
  loginController,
};
