import jwt from 'jsonwebtoken';

/**
 * Generate a short-lived JWT token
 * @param {String} userId - The ID of the user
 * @param {String} [expireIn='5m'] - The expiration time for the token (default is 5 minutes)
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

/** True when the request bears a server-minted schedule-fire token (scope claim verified). */
export const isScheduleFireRequest = (req: {
  headers: Record<string, string | string[] | undefined>;
}): boolean => {
  if (req.headers['x-lc-scheduled'] !== '1') {
    return false;
  }
  const auth = req.headers.authorization;
  const token = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : undefined;
  if (!token) {
    return false;
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] });
    return typeof payload === 'object' && payload?.scope === SCHEDULE_FIRE_SCOPE;
  } catch {
    return false;
  }
};
