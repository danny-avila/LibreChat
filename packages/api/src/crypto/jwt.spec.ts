import {
  isScheduleFireRequest,
  generateShortLivedToken,
  readScheduleFireClaims,
  SCHEDULE_FIRE_SCOPE,
  SCHEDULE_MANUAL_CLAIM,
} from './jwt';

/** Mirrors the loopback fire's headers, which is the only shape these helpers accept. */
function fireHeaders(token: string, scheduled = true) {
  return {
    headers: {
      ...(scheduled ? { 'x-lc-scheduled': '1' } : {}),
      authorization: `Bearer ${token}`,
    },
  };
}

describe('schedule fire claims', () => {
  const original = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  afterAll(() => {
    process.env.JWT_SECRET = original;
  });

  it('marks an automatic occurrence as scheduled but NOT manual', () => {
    const token = generateShortLivedToken('user-1', '60s', { scope: SCHEDULE_FIRE_SCOPE });
    expect(readScheduleFireClaims(fireHeaders(token))).toEqual({ scheduled: true, manual: false });
  });

  it('marks a Run Now fire as manual', () => {
    const token = generateShortLivedToken('user-1', '60s', {
      scope: SCHEDULE_FIRE_SCOPE,
      [SCHEDULE_MANUAL_CLAIM]: '1',
    });
    // Run Now dispatches the same billed generation over the same scoped token, but
    // enforces no cadence floor and no per-user window, so the limiter has to be able
    // to tell the two apart.
    expect(readScheduleFireClaims(fireHeaders(token))).toEqual({ scheduled: true, manual: true });
  });

  it('keeps a manual fire recognizable AS a scheduled fire', () => {
    const token = generateShortLivedToken('user-1', '60s', {
      scope: SCHEDULE_FIRE_SCOPE,
      [SCHEDULE_MANUAL_CLAIM]: '1',
    });
    // The controller attributes the run to its schedule off this predicate, so losing
    // it for Run Now would orphan the manual occurrence's run row.
    expect(isScheduleFireRequest(fireHeaders(token))).toBe(true);
  });

  it('rejects an unsigned or wrong-scope token', () => {
    const wrongScope = generateShortLivedToken('user-1', '60s', { scope: 'something_else' });
    expect(readScheduleFireClaims(fireHeaders(wrongScope))).toEqual({
      scheduled: false,
      manual: false,
    });
    expect(readScheduleFireClaims(fireHeaders('not-a-jwt'))).toEqual({
      scheduled: false,
      manual: false,
    });
  });

  it('rejects a valid token without the scheduled header', () => {
    const token = generateShortLivedToken('user-1', '60s', { scope: SCHEDULE_FIRE_SCOPE });
    expect(readScheduleFireClaims(fireHeaders(token, false)).scheduled).toBe(false);
  });
});
