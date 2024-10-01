const { SystemRoles } = require('librechat-data-provider');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const { getUserById, updateUser } = require('~/models');
const { createUser } = require('~/models/userMethods');
const { logger } = require('~/config');

// JWT strategy
const jwtLogin = async () =>
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET,
    },
    async (payload, done) => {
      try {
        logger.info('JwtStrategy => A new request with a JWT has been received, lets checking for the user existence: ' + payload?.id);
        let user = await getUserById(payload?.id, '-password -__v');
        if (user) {
          logger.info('JwtStrategy => User exists, so nothing to do just attend the request: ' + user._id);
          user.id = user._id.toString();
          if (!user.role) {
            logger.info('JwtStrategy => User had no role, so lets set it as USER: ' + user._id);
            user.role = SystemRoles.USER;
            await updateUser(user.id, { role: user.role });
          }
          done(null, user);
        //} else {
        //  logger.warn('[jwtLogin] JwtStrategy => no user found: ' + payload?.id);
        //  done(null, false);
        //}
        } else {
          logger.warn('JwtStrategy => no user found, creating new user: ' + payload?.email);
          
          const newUser = {
            _id: payload.id,          
            email: payload.email,     
            role: SystemRoles.USER,   
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          try {
            user = await createUser(newUser);
            logger.info('JwtStrategy => New user created: ' + user._id);
            done(null, user);
          } catch (createError) {
            logger.error('JwtStrategy => Error creating new user: ', createError);
            done(createError, false);
          }
        }
      } catch (err) {
        done(err, false);
      }
    },
  );

module.exports = jwtLogin;
