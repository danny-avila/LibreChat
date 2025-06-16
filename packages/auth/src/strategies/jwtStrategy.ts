import { getMethods } from '../initAuth';
import { logger } from '@librechat/data-schemas';
import { SystemRoles } from 'librechat-data-provider';
import {
  Strategy as JwtStrategy,
  ExtractJwt,
  StrategyOptionsWithoutRequest,
  VerifiedCallback,
} from 'passport-jwt';
import { Strategy as PassportStrategy } from 'passport-strategy';
import { JwtPayload } from './types';

// JWT strategy
const jwtLogin = (): PassportStrategy =>
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET,
    } as StrategyOptionsWithoutRequest,
    async (payload: JwtPayload, done: VerifiedCallback) => {
      const { updateUser, getUserById } = getMethods();
      try {
        const user = await getUserById(payload?.id, '-password -__v -totpSecret');
        if (user) {
          user.id = user._id.toString();
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

export default jwtLogin;
