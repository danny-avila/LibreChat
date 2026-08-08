const rateLimit = require('express-rate-limit');
const { ViolationTypes } = require('librechat-data-provider');
const { limiterCache, removePorts } = require('@librechat/api');
const { logViolation } = require('~/cache');

const {
  VERIFY_EMAIL_SUBMISSION_WINDOW = process.env.VERIFY_EMAIL_WINDOW ?? 2,
  VERIFY_EMAIL_SUBMISSION_MAX = process.env.VERIFY_EMAIL_MAX ?? 2,
  VERIFY_EMAIL_SUBMISSION_VIOLATION_SCORE: score,
} = process.env;
const windowMs = VERIFY_EMAIL_SUBMISSION_WINDOW * 60 * 1000;
const max = VERIFY_EMAIL_SUBMISSION_MAX;
const windowInMinutes = windowMs / 60000;
const message = `Too many attempts, please try again after ${windowInMinutes} minute(s)`;
const objectIdPattern = /^[a-f\d]{24}$/i;

const handler = async (req, res) => {
  const type = ViolationTypes.VERIFY_EMAIL_LIMIT;
  const errorMessage = {
    type,
    max,
    windowInMinutes,
    limiter: 'submission',
  };

  await logViolation(req, res, type, errorMessage, score);
  return res.status(429).json({ message });
};

const getEmailChangeSubmissionKey = (req) => {
  const ip = removePorts(req) ?? 'unknown';
  const submittedUserId = req.body?.userId;
  const userId =
    typeof submittedUserId === 'string' && objectIdPattern.test(submittedUserId)
      ? submittedUserId.toLowerCase()
      : 'invalid';
  return `ip:${ip}:user:${userId}`;
};

const limiterOptions = {
  windowMs,
  max,
  handler,
  keyGenerator: getEmailChangeSubmissionKey,
  store: limiterCache('email_change_submission_limiter'),
};

const emailChangeSubmissionLimiter = rateLimit(limiterOptions);

module.exports = emailChangeSubmissionLimiter;
