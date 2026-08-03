const { AGENT_TRIGGER_SCOPE } = require('@librechat/api');
const { logger, runAsSystem } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const { getUserById, updateUser } = require('~/models');

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
        const user = await runAsSystem(() =>
          getUserById(
            payload?.id,
            '-password -__v -totpSecret -backupCodes +agentTriggerDeletionStartedAt',
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
          // Deletion barrier, same as the OpenID strategy: once deletionRequestedAt
          // is stamped the destructive cascade (or its deferred sweep) is coming, and
          // an interactive job admitted here would persist messages and usage records
          // for the deleted account after it runs.
          if (user.deletionRequestedAt != null) {
            logger.warn(`[jwtLogin] Refusing authentication for deleting user: ${payload?.id}`);
            done(null, false, { message: 'Account deletion in progress' });
            return;
          }
          user.id = user._id.toString();
          /** Absent on the full doc means local user; null skips getUserPrincipals' fallback lookup */
          user.idOnTheSource ??= null;
          if (!user.role) {
            user.role = SystemRoles.USER;
            await runAsSystem(() => updateUser(user.id, { role: user.role }));
          }
          // The read above can be a pre-barrier snapshot returned AFTER the barrier
          // committed (the same interleaving the OpenID path rechecks). A second read
          // SEQUENCED after every await in this callback — including the role
          // backfill, itself a slow user-document write — observes any barrier that
          // committed before it; placing it earlier reopened the window for the
          // backfill's duration. Deliberately NOT scoped by HTTP method: method is
          // not a safe classifier — GET handlers persist data too (GET /api/balance
          // upserts via setBalanceConfig) — so every request pays the one lean
          // point-read.
          let barrier = null;
          try {
            barrier = await getUserById(payload?.id, 'deletionRequestedAt');
          } catch {
            barrier = null;
          }
          if (barrier == null || barrier.deletionRequestedAt != null) {
            logger.warn(
              `[jwtLogin] Refusing authentication for ${payload?.id}: deletion barrier raised or unverifiable`,
            );
            done(null, false, { message: 'Account deletion in progress' });
            return;
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
