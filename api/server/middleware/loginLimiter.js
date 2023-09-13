const rateLimit = require('express-rate-limit');
const windowMs = (process.env?.LOGIN_WINDOW ?? 5) * 60 * 1000; // default: 5 minutes
const max = process.env?.LOGIN_MAX ?? 7; // default: limit each IP to 7 requests per windowMs
const windowInMinutes = windowMs / 60000;

const loginLimiter = rateLimit({
  windowMs,
  max,
  message: `Too many login attempts from this IP, please try again after ${windowInMinutes} minutes.`,
  keyGenerator: function (req) {
    // Strip out the port number from the IP address
    return req.ip.replace(/:\d+[^:]*$/, '');
  },
});

module.exports = loginLimiter;
