const { SystemRoles } = require('librechat-data-provider');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const { logger } = require('~/config');
const db = require('~/lib/db/connectDb');

// JWT strategy
const jwtLogin = () =>
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET,
    },
    async (payload, done) => {
      try {
        const {User} = db.models;
        const user = await User.getUserById(payload?.id, '-password -__v -totpSecret');
        if (user) {
          user.id = user._id.toString();
          if (!user.role) {
            user.role = SystemRoles.USER;
            await User.updateUser(user.id, { role: user.role });
          }
          done(null, user);
        } else {
          logger.warn('[jwtLogin] JwtStrategy => no user found: ' + payload?.id);
          done(null, false);
        }
      } catch (err) {
        done(err, false);
      }
    },
  );

module.exports = jwtLogin;
