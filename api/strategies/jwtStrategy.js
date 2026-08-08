const { logger } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const { getUserById, updateUser } = require('~/models');
const { isTokenIssuedBeforeCredentialChange } = require('./credentials');

// JWT strategy
const jwtLogin = () =>
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET,
    },
    async (payload, done) => {
      try {
        const user = await getUserById(payload?.id, '-password -__v -totpSecret -backupCodes');
        if (user) {
          if (isTokenIssuedBeforeCredentialChange(payload, user)) {
            logger.warn(
              '[jwtLogin] JwtStrategy => token predates the last credential change: ' + payload?.id,
            );
            done(null, false);
            return;
          }
          user.id = user._id.toString();
          /** Absent on the full doc means local user; null skips getUserPrincipals' fallback lookup */
          user.idOnTheSource ??= null;
          if (!user.role) {
            user.role = SystemRoles.USER;
            await updateUser(user.id, { role: user.role });
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
