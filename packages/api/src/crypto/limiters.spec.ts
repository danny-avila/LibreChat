import {
  exemptFromIpLimiter,
  SCHEDULE_FIRE_SCOPE,
  exemptFromUserLimiter,
  exemptFromConcurrencyLimiter,
  SCHEDULE_MANUAL_CLAIM,
  readScheduleFireClaims,
  generateShortLivedToken,
} from './jwt';

type FireKind = 'automatic' | 'manual' | 'interactive';

/** Builds a request as the chat router sees it, including its capture middleware. */
function request(kind: FireKind) {
  if (kind === 'interactive') {
    return { headers: {} };
  }
  const token = generateShortLivedToken('user-1', '60s', {
    scope: SCHEDULE_FIRE_SCOPE,
    ...(kind === 'manual' ? { [SCHEDULE_MANUAL_CLAIM]: '1' } : {}),
  });
  const req: {
    headers: Record<string, string>;
    _isScheduledFire?: boolean;
    _isManualScheduledFire?: boolean;
  } = { headers: { 'x-lc-scheduled': '1', authorization: `Bearer ${token}` } };
  const claims = readScheduleFireClaims(req);
  req._isScheduledFire = claims.scheduled;
  req._isManualScheduledFire = claims.manual;
  return req;
}

describe('message-limiter exemptions for scheduled fires', () => {
  const original = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  afterAll(() => {
    process.env.JWT_SECRET = original;
  });

  describe('IP limiter', () => {
    it.each<FireKind>(['automatic', 'manual'])('exempts a %s fire', (kind) => {
      // Every fire reaches the chat router over the SERVER's loopback, so its address is
      // never the initiating client's. Keying here would pool all users into one bucket
      // and let any user's Run Now volume reject everyone else's. Manual runs are
      // IP-limited at /api/schedules/:id/run, where the real address still exists.
      expect(exemptFromIpLimiter(request(kind))).toBe(true);
    });

    it('does not exempt an ordinary interactive turn', () => {
      expect(exemptFromIpLimiter(request('interactive'))).toBe(false);
    });
  });

  describe('user limiter', () => {
    it('exempts an automatic occurrence', () => {
      // Already bounded by the cadence floor and the global fireConcurrency slot;
      // limiting again would record legitimate fires as errors toward auto-disable.
      expect(exemptFromUserLimiter(request('automatic'))).toBe(true);
    });

    it('does NOT exempt a manual Run Now', () => {
      // Keyed on the authenticated id, which the fire token carries intact across the
      // loopback — so this is the limiter that actually bounds Run Now volume.
      expect(exemptFromUserLimiter(request('manual'))).toBe(false);
    });

    it('does not exempt an ordinary interactive turn', () => {
      expect(exemptFromUserLimiter(request('interactive'))).toBe(false);
    });
  });

  /**
   * The ACQUIRE and both RELEASE points live in different files (request.js twice,
   * client.js once on the HITL pause path). Re-deriving this rule at each site is what
   * let them drift: the acquire became manual-aware while a release did not, so every
   * paused Run Now leaked a slot until the counter's idle TTL expired.
   */
  describe('concurrency limiter', () => {
    it('exempts an automatic occurrence, which never increments', () => {
      expect(exemptFromConcurrencyLimiter(request('automatic'))).toBe(true);
    });

    it('does NOT exempt a Run Now, which holds a real slot and must release it', () => {
      expect(exemptFromConcurrencyLimiter(request('manual'))).toBe(false);
    });

    it('does not exempt an ordinary interactive turn', () => {
      expect(exemptFromConcurrencyLimiter(request('interactive'))).toBe(false);
    });
  });

  it('limits rather than exempts a request whose token cannot be verified', () => {
    const req = { headers: { 'x-lc-scheduled': '1', authorization: 'Bearer not-a-jwt' } };
    expect(exemptFromIpLimiter(req)).toBe(false);
    expect(exemptFromUserLimiter(req)).toBe(false);
  });

  it('trusts the captured classification over a token that expired mid-chain', () => {
    // The short-lived token can expire during the slower chat middleware; re-verifying
    // would demote a valid automatic fire into a limited interactive turn.
    const expired = { headers: { authorization: 'Bearer expired' }, _isScheduledFire: true };
    expect(exemptFromIpLimiter(expired)).toBe(true);
    expect(exemptFromUserLimiter(expired)).toBe(true);
  });
});
