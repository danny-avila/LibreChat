import jwt from 'jsonwebtoken';

const ONBOARDING_PURPOSE = 'organization_onboarding';

/** Long enough to name an organization or open an invite, short enough to be no session. */
export const ORGANIZATION_ONBOARDING_TOKEN_EXPIRY = '30m';

export interface OnboardingCredential {
  accountId: string;
  issuedAt?: number;
  issuedAtMs?: number;
}

/**
 * Mints the credential an account without any organization signs in with. It names the
 * account, not a member, so it opens no organization: only creating one or accepting an
 * invite accepts it. `issuedAtMs` lets a password reset retire it like any other credential.
 */
export function generateOrganizationOnboardingToken(accountId: string, jwtSecret: string): string {
  return jwt.sign({ accountId, purpose: ONBOARDING_PURPOSE, issuedAtMs: Date.now() }, jwtSecret, {
    expiresIn: ORGANIZATION_ONBOARDING_TOKEN_EXPIRY,
  });
}

/** The account an onboarding token names, or `undefined` when it is not a valid one. */
export function verifyOrganizationOnboardingToken(
  token: string | undefined,
  jwtSecret: string | undefined,
): OnboardingCredential | undefined {
  if (!token || !jwtSecret) {
    return undefined;
  }
  try {
    const payload = jwt.verify(token, jwtSecret);
    if (
      typeof payload !== 'object' ||
      payload.purpose !== ONBOARDING_PURPOSE ||
      typeof payload.accountId !== 'string' ||
      !payload.accountId
    ) {
      return undefined;
    }
    return {
      accountId: payload.accountId,
      issuedAt: payload.iat,
      issuedAtMs: typeof payload.issuedAtMs === 'number' ? payload.issuedAtMs : undefined,
    };
  } catch {
    return undefined;
  }
}
