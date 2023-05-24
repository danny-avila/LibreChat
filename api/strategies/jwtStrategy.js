const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const User = require('../models/User');
const { jwt } = require('../../config/app');

// JWT strategy
const jwtLogin = new JwtStrategy(
  {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: jwt.secret
  },
  async (payload, done) => {
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
