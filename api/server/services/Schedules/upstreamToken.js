let resolver;

/**
 * Registers the application resolver used to obtain renewable upstream credentials
 * for unattended schedule execution. Credentials remain owned by the resolver and
 * are never serialized into schedule or trigger records.
 *
 * @param {((user: import('@librechat/data-schemas').IUser, options: { signal?: AbortSignal }) => import('@librechat/api').UpstreamTokenProvider | undefined | Promise<import('@librechat/api').UpstreamTokenProvider | undefined>) | undefined} nextResolver
 */
function setScheduleUpstreamTokenProviderResolver(nextResolver) {
  if (nextResolver != null && typeof nextResolver !== 'function') {
    throw new TypeError('Schedule upstream-token resolver must be a function');
  }
  resolver = nextResolver;
}

/**
 * Resolves a provider at each unattended boundary so short-lived access tokens
 * are not captured when a schedule is created.
 *
 * @param {import('@librechat/data-schemas').IUser} user
 * @param {{ signal?: AbortSignal }} [options]
 */
async function resolveScheduleUpstreamTokenProvider(user, options = {}) {
  return resolver?.(user, options);
}

module.exports = {
  setScheduleUpstreamTokenProviderResolver,
  resolveScheduleUpstreamTokenProvider,
};
