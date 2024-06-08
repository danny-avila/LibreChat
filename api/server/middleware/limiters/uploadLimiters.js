const rateLimit = require('express-rate-limit');
const { ViolationTypes } = require('librechat-data-provider');
const logViolation = require('~/cache/logViolation');

const getEnvironmentVariables = () => {
  const FILE_UPLOAD_IP_MAX = parseInt(process.env.FILE_UPLOAD_IP_MAX) || 100;
  const FILE_UPLOAD_IP_WINDOW = parseInt(process.env.FILE_UPLOAD_IP_WINDOW) || 15;
  const FILE_UPLOAD_USER_MAX = parseInt(process.env.FILE_UPLOAD_USER_MAX) || 50;
  const FILE_UPLOAD_USER_WINDOW = parseInt(process.env.FILE_UPLOAD_USER_WINDOW) || 15;

  const fileUploadIpWindowMs = FILE_UPLOAD_IP_WINDOW * 60 * 1000;
  const fileUploadIpMax = FILE_UPLOAD_IP_MAX;
  const fileUploadIpWindowInMinutes = fileUploadIpWindowMs / 60000;

  const fileUploadUserWindowMs = FILE_UPLOAD_USER_WINDOW * 60 * 1000;
  const fileUploadUserMax = FILE_UPLOAD_USER_MAX;
  const fileUploadUserWindowInMinutes = fileUploadUserWindowMs / 60000;

  return {
    fileUploadIpWindowMs,
    fileUploadIpMax,
    fileUploadIpWindowInMinutes,
    fileUploadUserWindowMs,
    fileUploadUserMax,
    fileUploadUserWindowInMinutes,
  };
};

const createFileUploadHandler = (ip = true) => {
  const {
    fileUploadIpMax,
    fileUploadIpWindowInMinutes,
    fileUploadUserMax,
    fileUploadUserWindowInMinutes,
  } = getEnvironmentVariables();

  return async (req, res) => {
    const type = ViolationTypes.FILE_UPLOAD_LIMIT;
    const errorMessage = {
      type,
      max: ip ? fileUploadIpMax : fileUploadUserMax,
      limiter: ip ? 'ip' : 'user',
      windowInMinutes: ip ? fileUploadIpWindowInMinutes : fileUploadUserWindowInMinutes,
    };

    await logViolation(req, res, type, errorMessage);
    res.status(429).json({ message: 'Too many file upload requests. Try again later' });
  };
};

const createFileLimiters = () => {
  const { fileUploadIpWindowMs, fileUploadIpMax, fileUploadUserWindowMs, fileUploadUserMax } =
    getEnvironmentVariables();

  const fileUploadIpLimiter = rateLimit({
    windowMs: fileUploadIpWindowMs,
    max: fileUploadIpMax,
    handler: createFileUploadHandler(),
  });

  const fileUploadUserLimiter = rateLimit({
    windowMs: fileUploadUserWindowMs,
    max: fileUploadUserMax,
    handler: createFileUploadHandler(false),
    keyGenerator: function (req) {
      return req.user?.id; // Use the user ID or NULL if not available
    },
  });

  return { fileUploadIpLimiter, fileUploadUserLimiter };
};

module.exports = {
  createFileLimiters,
};
