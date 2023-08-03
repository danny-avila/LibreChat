const DebugControl = require('../utils/debug.js');
const { setAuthTokens } = require('../server/services/AuthService');
const jwt = require('jsonwebtoken');
const Session = require('../models/Session');
const User = require('../models/User');
const crypto = require('crypto');
const cookies = require('cookie');
const isProduction = process.env.NODE_ENV === 'production';

function log({ title, parameters }) {
  DebugControl.log.functionName(title);
  if (parameters) {
    DebugControl.log.parameters(parameters);
  }
}

const refreshTokenValidator = async (req, res, next) => {
  const refreshToken = req.headers.cookie ? cookies.parse(req.headers.cookie).refreshToken : null;
  const token = req.headers.cookie ? cookies.parse(req.headers.cookie).token : null;
  let user;
  if (refreshToken && !token) {
    try {
      const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      const userId = payload.id;
      const user = await User.findOne({ _id: userId });
      if (user) {
        // Hash the refresh token
        const hash = crypto.createHash('sha256');
        const hashedToken = hash.update(refreshToken).digest('hex');
        // Find the session with the hashed refresh token
        const session = await Session.findOne({ user: userId, refreshTokenHash: hashedToken });
        if (session && session.expiration > new Date()) {
          const token = await setAuthTokens(userId, res, session._id);
        }
      }
      res.setHeader('Authorization', `Bearer ${token}`);
    } catch (err) {
      log({
        title: '(requireLocalAuth) Error refreshing token',
        parameters: [{ name: 'error', value: err }],
      });
    }
  }
  next();
};

module.exports = refreshTokenValidator;
