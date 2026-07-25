import jwt from 'jsonwebtoken';

/**
 * Generate a short-lived JWT token
 * @param {String} userId - The ID of the user
 * @param {String} [expireIn='5m'] - The expiration time for the token (default is 5 minutes)
 * @param {Record<string, string>} [extraClaims] - PRIVILEGED. Extra claims are trusted
 *   downstream: `{ scope: SCHEDULE_FIRE_SCOPE }` mints a token that bypasses the
 *   interactive message + concurrency limiters (see `isScheduleFireRequest`). Only
 *   the scheduler (`services/Schedules`) may pass it — never from a user-facing mint.
 * @returns {String} - The generated JWT token
 */
export const generateShortLivedToken = (
  userId: string,
  expireIn: string = '5m',
  extraClaims?: Record<string, string>,
): string => {
  return jwt.sign({ id: userId, ...extraClaims }, process.env.JWT_SECRET!, {
    expiresIn: expireIn,
    algorithm: 'HS256',
  });
};

export const SCHEDULE_FIRE_SCOPE = 'schedule_fire';

/** Claim marking a fire a USER-triggered Run Now rather than an automatic occurrence. */
export const SCHEDULE_MANUAL_CLAIM = 'manual';

export interface ScheduleFireClaims {
  /** A server-minted schedule fire of either kind. */
  scheduled: boolean;
  /**
   * Triggered by the owner clicking Run Now. Automatic occurrences are governed by the
   * scheduler's own caps (cadence floor, fireConcurrency), which is what justifies
   * exempting them from the interactive limiters. Run Now has neither, so it is
   * user-paced request volume wearing a scheduled token and must NOT inherit that
   * exemption.
   */
  manual: boolean;
}

/** Verifies a request's schedule-fire token and reports which kind of fire it is. */
export const readScheduleFireClaims = (req: {
  headers: Record<string, string | string[] | undefined>;
}): ScheduleFireClaims => {
  const none: ScheduleFireClaims = { scheduled: false, manual: false };
  if (req.headers['x-lc-scheduled'] !== '1') {
    return none;
  }
  const auth = req.headers.authorization;
  const token = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : undefined;
  if (!token) {
    return none;
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] });
    if (typeof payload !== 'object' || payload?.scope !== SCHEDULE_FIRE_SCOPE) {
      return none;
    }
    return { scheduled: true, manual: payload[SCHEDULE_MANUAL_CLAIM] === '1' };
  } catch {
    return none;
  }
};

/** True when the request bears a server-minted schedule-fire token (scope claim verified). */
export const isScheduleFireRequest = (req: {
  headers: Record<string, string | string[] | undefined>;
}): boolean => readScheduleFireClaims(req).scheduled;

/**
 * A request whose fire classification the chat router already captured. Re-verifying
 * downstream would demote a valid fire whose short-lived token expired during the
 * slower middleware chain, so the captured decision wins when present.
 */
interface ClassifiedFireRequest {
  headers: Record<string, string | string[] | undefined>;
  _isScheduledFire?: boolean;
  _isManualScheduledFire?: boolean;
}

const classify = (req: ClassifiedFireRequest): ScheduleFireClaims =>
  typeof req._isScheduledFire === 'boolean'
    ? { scheduled: req._isScheduledFire, manual: req._isManualScheduledFire === true }
    : readScheduleFireClaims(req);

/**
 * Whether the IP-based message limiter should be SKIPPED.
 *
 * Every fire — automatic or manual — reaches the chat router over the server's own
 * loopback, so its address is never the initiating client's. Keying an IP limiter there
 * would put all users in ONE bucket, letting any user's Run Now volume reject everyone
 * else's. Manual runs are IP-limited at `/api/schedules/:id/run` instead, where the real
 * address is still on the request.
 */
export const exemptFromIpLimiter = (req: ClassifiedFireRequest): boolean => classify(req).scheduled;

/**
 * Whether the USER-based message limiter should be SKIPPED.
 *
 * Only AUTOMATIC occurrences are exempt: the scheduler's own caps (cadence floor, global
 * fireConcurrency) already bound them, and limiting them again would record legitimate
 * fires as errors that walk schedules toward auto-disable. Run Now has neither cap, and
 * this limiter keys on the authenticated id, which the fire token carries intact across
 * the loopback — so it is the one that actually bounds manual volume.
 */
export const exemptFromUserLimiter = (req: ClassifiedFireRequest): boolean => {
  const claims = classify(req);
  return claims.scheduled && !claims.manual;
};
