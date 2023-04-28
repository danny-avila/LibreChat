const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const User = require('../models/User');
const DebugControl = require('../utils/debug.js');

function log({ title, parameters }) {
  DebugControl.log.functionName(title);
  DebugControl.log.parameters(parameters);
}

const isProduction = process.env.NODE_ENV === 'production';
const secretOrKey = isProduction ? process.env.JWT_SECRET_PROD : process.env.JWT_SECRET_DEV;

// JWT strategy
const jwtLogin = new JwtStrategy(
  {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey
  },
  async (payload, done) => {
    log({
      title: 'JWT Strategy',
      parameters: [{ name: 'payload', value: payload }]
    });
    try {
      const user = await User.findById(payload.id);
      if (user) {
        done(null, user);
      } else {
        console.log('JwtStrategy => no user found');
        done(null, false);
      }
    } catch (err) {
      done(err, false);
    }
  }
);

passport.use(jwtLogin);
