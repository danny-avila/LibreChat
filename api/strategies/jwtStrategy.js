const { logger, runAsSystem } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const {
  AGENT_TRIGGER_SCOPE,
  isTokenRetired,
  continueAfterBearerRetirement,
} = require('@librechat/api');
const { getAuthUserById } = require('~/server/services/AuthSessions');
const { updateUser } = require('~/models');

const AGENT_TRIGGER_ADMISSION_PATHS = ['/api/agents/chat/agents', '/api/agents/chat/steer/deliver'];

/** A trigger-scoped bearer is deliberately useless outside the two internal
 * admission routes that the execution host calls. */
function isAgentTriggerAdmissionRequest(req) {
  if (req?.method !== 'POST' || req?.headers?.['x-lc-agent-trigger'] !== '1') {
    return false;
  }
  try {
    const pathname = new URL(req.originalUrl ?? req.url ?? '', 'http://localhost').pathname;
    return AGENT_TRIGGER_ADMISSION_PATHS.some((path) => pathname.endsWith(path));
  } catch {
    return false;
  }
}

// JWT strategy
const jwtLogin = () =>
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET,
      passReqToCallback: true,
    },
    async (req, payload, done) => {
      try {
        if (payload?.scope === AGENT_TRIGGER_SCOPE && !isAgentTriggerAdmissionRequest(req)) {
          done(null, false, { message: 'Agent trigger token is not valid for this endpoint' });
          return;
        }
        /* With organizations, `aid` names the member's login account and `tid` its organization,
         * so all three load in one parallel round; a token naming an account itself, the wrong
         * one, or a suspended organization finds no user. */
        const user = await runAsSystem(() =>
          getAuthUserById(
            payload?.id,
            '-password -__v -totpSecret -backupCodes +agentTriggerDeletionStartedAt',
            typeof payload?.aid === 'string' ? payload.aid : undefined,
            typeof payload?.tid === 'string' ? payload.tid : undefined,
          ),
        );
        if (user?.agentTriggerDeletionStartedAt != null) {
          done(null, false, {
            message: 'Account deletion is in progress',
            code: 'ACCOUNT_DELETION_IN_PROGRESS',
          });
          return;
        }
        if (user) {
          return await continueAfterBearerRetirement(
            user,
            { issuedAt: payload?.iat, issuedAtMs: payload?.issuedAtMs },
            'jwt',
            payload?.id,
            done,
            (message) => logger.warn(message),
            async () => {
              user.id = user._id.toString();
              /** Absent on the full doc means local user; null skips getUserPrincipals' fallback lookup */
              user.idOnTheSource ??= null;
              if (!user.role) {
                user.role = SystemRoles.USER;
                await runAsSystem(() => updateUser(user.id, { role: user.role }));
              }
              done(null, user);
            },
            isTokenRetired,
          );
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
