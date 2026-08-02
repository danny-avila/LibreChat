/**
 * Pins the exchange contract against what exode-main actually sends.
 *
 * These two repos deploy separately and the schema is validated with `safeParse`, so a mismatch
 * does not fail loudly — it turns every handshake into a generic 502 "chat unavailable" with the
 * real cause hidden. That is exactly what happened: main omitted `userId`/`userUuid`, which the
 * schema requires but nothing downstream reads, and the bridge could never complete.
 */
import { exodeMainResponseSchema } from './types';

/** Exactly what exode-main's knowledge-chat.controller now returns */
const payload = {
  payload: {
    token: 'a'.repeat(64),
    expiresAt: new Date().toISOString(),
    identity: {
      subject: 'b'.repeat(64),
      userId: 42,
      userUuid: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      name: 'Elmir Ismailzada',
      schoolId: 9,
      sellerId: undefined,
      librechatUserId: 'lc-user-1',
    },
    agents: { knowledge: 'agent_router', assistant: 'agent_assist' },
  },
};

describe('exode main exchange contract', () => {
  it('accepts what exode-main actually sends', () => {
    const parsed = exodeMainResponseSchema.safeParse(payload);
    if (!parsed.success) { console.error(JSON.stringify(parsed.error.issues, null, 2)); }
    expect(parsed.success).toBe(true);
  });

  it('still accepts a user with no profile name via the uuid fallback', () => {
    const p = { payload: { ...payload.payload,
      identity: { ...payload.payload.identity, name: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' } } };
    expect(exodeMainResponseSchema.safeParse(p).success).toBe(true);
  });
});

describe('regression', () => {
  it('rejects the pre-fix payload that omitted userId/userUuid', () => {
    const broken = { payload: { ...payload.payload,
      identity: { subject: 'b'.repeat(64), name: 'X', librechatUserId: 'lc-1' } } };
    expect(exodeMainResponseSchema.safeParse(broken).success).toBe(false);
  });
});
