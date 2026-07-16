const rateLimit = require('express-rate-limit');
const { ViolationTypes } = require('librechat-data-provider');
const { limiterCache, removePorts } = require('@librechat/api');
const logViolation = require('~/cache/logViolation');

/**
 * Deliberately tighter than the TTS/STT limits: each mint starts a billable third-party
 * session, and a caller only needs one token per call rather than one per utterance.
 */
const getEnvironmentVariables = () => {
  const VOICE_IP_MAX = parseInt(process.env.VOICE_IP_MAX) || 20;
  const VOICE_IP_WINDOW = parseInt(process.env.VOICE_IP_WINDOW) || 1;
  const VOICE_USER_MAX = parseInt(process.env.VOICE_USER_MAX) || 10;
  const VOICE_USER_WINDOW = parseInt(process.env.VOICE_USER_WINDOW) || 1;
  const VOICE_VIOLATION_SCORE = process.env.VOICE_VIOLATION_SCORE;

  const voiceIpWindowMs = VOICE_IP_WINDOW * 60 * 1000;
  const voiceIpMax = VOICE_IP_MAX;
  const voiceIpWindowInMinutes = voiceIpWindowMs / 60000;

  const voiceUserWindowMs = VOICE_USER_WINDOW * 60 * 1000;
  const voiceUserMax = VOICE_USER_MAX;
  const voiceUserWindowInMinutes = voiceUserWindowMs / 60000;

  return {
    voiceIpWindowMs,
    voiceIpMax,
    voiceIpWindowInMinutes,
    voiceUserWindowMs,
    voiceUserMax,
    voiceUserWindowInMinutes,
    voiceViolationScore: VOICE_VIOLATION_SCORE,
  };
};

const createVoiceHandler = (ip = true) => {
  const {
    voiceIpMax,
    voiceIpWindowInMinutes,
    voiceUserMax,
    voiceUserWindowInMinutes,
    voiceViolationScore,
  } = getEnvironmentVariables();

  return async (req, res) => {
    const type = ViolationTypes.VOICE_LIMIT;
    const errorMessage = {
      type,
      max: ip ? voiceIpMax : voiceUserMax,
      limiter: ip ? 'ip' : 'user',
      windowInMinutes: ip ? voiceIpWindowInMinutes : voiceUserWindowInMinutes,
    };

    await logViolation(req, res, type, errorMessage, voiceViolationScore);
    res.status(429).json({ message: 'Too many voice session requests. Try again later' });
  };
};

const createVoiceLimiters = () => {
  const { voiceIpWindowMs, voiceIpMax, voiceUserWindowMs, voiceUserMax } =
    getEnvironmentVariables();

  const voiceIpLimiter = rateLimit({
    windowMs: voiceIpWindowMs,
    max: voiceIpMax,
    handler: createVoiceHandler(),
    keyGenerator: removePorts,
    store: limiterCache('voice_ip_limiter'),
  });

  const voiceUserLimiter = rateLimit({
    windowMs: voiceUserWindowMs,
    max: voiceUserMax,
    handler: createVoiceHandler(false),
    keyGenerator: function (req) {
      return req.user?.id;
    },
    store: limiterCache('voice_user_limiter'),
  });

  return { voiceIpLimiter, voiceUserLimiter };
};

module.exports = createVoiceLimiters;
