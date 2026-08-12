const { logger } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const { getUserById, updateUser } = require('~/models');

/**
 * A proxy in front of LibreChat may write the Authorization header itself (oauth2-proxy
 * with --set-authorization-header, meshes and gateways doing credential injection), in
 * which case the session token never arrives. JWT_AUTH_HEADER names a header to try
 * first, holding the raw token with no scheme prefix. Unset, nothing changes.
 */
const jwtExtractor = () => {
  const extractors = [];
  // node lowercases incoming header names; fromHeader looks the key up as-is
  const header = process.env.JWT_AUTH_HEADER?.trim().toLowerCase();
  if (header) {
    extractors.push(ExtractJwt.fromHeader(header));
  }
  extractors.push(ExtractJwt.fromAuthHeaderAsBearerToken());
  return extractors.length > 1 ? ExtractJwt.fromExtractors(extractors) : extractors[0];
};

// JWT strategy
const jwtLogin = () =>
  new JwtStrategy(
    {
      jwtFromRequest: jwtExtractor(),
      secretOrKey: process.env.JWT_SECRET,
    },
    async (payload, done) => {
      try {
        const user = await getUserById(payload?.id, '-password -__v -totpSecret -backupCodes');
        if (user) {
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
