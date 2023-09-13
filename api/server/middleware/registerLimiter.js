const rateLimit = require('express-rate-limit');
const windowMs = (process.env?.REGISTER_WINDOW ?? 60) * 60 * 1000; // default: 1 hour
const max = process.env?.REGISTER_MAX ?? 5; // default: limit each IP to 5 registrations per windowMs
const windowInMinutes = windowMs / 60000;

const registerLimiter = rateLimit({
  windowMs,
  max,
  message: `Too many accounts created from this IP, please try again after ${windowInMinutes} minutes`,
  keyGenerator: function (req) {
    // Strip out the port number from the IP address
    return req.ip.replace(/:\d+[^:]*$/, '');
  },
});

module.exports = registerLimiter;
