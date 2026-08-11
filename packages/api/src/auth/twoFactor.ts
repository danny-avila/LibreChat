import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { isTwoFactorPolicyProvider } from 'librechat-data-provider';
import type {
  IUser,
  TwoFactorEnrollmentGuard,
  TwoFactorEnrollmentUpdate,
} from '@librechat/data-schemas';
import type { NextFunction, Request, Response } from 'express';
import { isEnabled } from '~/utils';

const TWO_FACTOR_SETUP_TOKEN_EXPIRY = '10m';
const TWO_FACTOR_SETUP_ACKNOWLEDGEMENT_TOKEN_EXPIRY = '5m';
const TWO_FACTOR_SETUP_FINALIZATION_TOKEN_EXPIRY = '5m';
const TWO_FACTOR_LOGIN_CHALLENGE_TOKEN_EXPIRY = '5m';
const TWO_FACTOR_SETUP_UNAVAILABLE = '2FA setup is not available for this user';
const TWO_FACTOR_SETUP_NOT_INITIATED = '2FA setup not initiated';
const TWO_FACTOR_SETUP_STALE = 'This two-factor setup step expired. Confirm your code again.';
const TWO_FACTOR_INVALID_TOKEN = 'Invalid token';
const TWO_FACTOR_ENROLLMENT_PROJECTION =
  '+pendingTotpSecret +pendingBackupCodes _id twoFactorEnabled provider';

export const TWO_FACTOR_TOKEN_PURPOSE = {
  LOGIN_CHALLENGE: 'login_2fa_challenge',
  REQUIRED_SETUP: 'required_2fa_setup',
  REQUIRED_ACKNOWLEDGEMENT: 'required_2fa_acknowledgement',
  REQUIRED_FINALIZATION: 'required_2fa_finalization',
} as const;

interface TwoFactorSetupClaims {
  userId: string;
  purpose: typeof TWO_FACTOR_TOKEN_PURPOSE.REQUIRED_SETUP;
}

interface TwoFactorLoginChallengeClaims {
  userId: string;
  purpose: typeof TWO_FACTOR_TOKEN_PURPOSE.LOGIN_CHALLENGE;
}

interface TwoFactorSetupBody {
  tempToken?: string;
  acknowledgementToken?: string;
  finalizationToken?: string;
}

/** Identity plus the one-time nonce a required-enrollment credential carries. */
export interface TwoFactorEnrollmentCredential {
  userId: string;
  nonce: string;
}

/** An Express request that a required-enrollment credential has been validated for. */
export type TwoFactorEnrollmentRequest = Request & {
  user?: { id: string };
  twoFactorEnrollmentNonce?: string;
};

export type TwoFactorSetupUser = Pick<
  IUser,
  '_id' | 'provider' | 'twoFactorEnabled' | 'pendingTotpSecret' | 'pendingBackupCodes'
>;

export interface TwoFactorEnrollmentDependencies {
  getUserById: (userId: string, projection: string) => Promise<TwoFactorSetupUser | null>;
  getTOTPSecret: (storedSecret: string) => Promise<string | null>;
  verifyTOTP: (secret: string, token: string) => Promise<boolean>;
  generateBackupCodes: () => Promise<{
    plainCodes: string[];
    codeObjects: NonNullable<IUser['backupCodes']>;
  }>;
  updateTwoFactorEnrollment: (
    userId: string,
    guard: TwoFactorEnrollmentGuard,
    update: TwoFactorEnrollmentUpdate,
  ) => Promise<IUser | null>;
}

type TwoFactorEnrollmentFailure = { ok: false; status: 400; message: string };

export type TwoFactorConfirmResult =
  | { ok: true; user: IUser; plainCodes: string[]; acknowledgementNonce: string }
  | TwoFactorEnrollmentFailure;

export type TwoFactorAcknowledgeResult =
  | { ok: true; user: IUser; finalizationNonce: string }
  | TwoFactorEnrollmentFailure;

export type TwoFactorFinalizeResult = { ok: true; user: IUser } | TwoFactorEnrollmentFailure;

const fail = (message: string): TwoFactorEnrollmentFailure => ({ ok: false, status: 400, message });

/** 256 bits of entropy, so the stored SHA-256 digest is not brute-forceable. */
const createEnrollmentNonce = (): string => randomBytes(32).toString('hex');

const hashEnrollmentNonce = (nonce: string): string =>
  createHash('sha256').update(nonce).digest('hex');

export function isTwoFactorEnrollmentRequired(
  user: (Pick<IUser, 'twoFactorEnabled'> & Partial<Pick<IUser, 'provider'>>) | null | undefined,
): boolean {
  if (!isEnabled(process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION) || user?.twoFactorEnabled) {
    return false;
  }

  return isTwoFactorPolicyProvider(user?.provider);
}

export function isTwoFactorSetupEligible(
  user: Partial<Pick<IUser, 'provider'>> | null | undefined,
): boolean {
  return isTwoFactorPolicyProvider(user?.provider);
}

export function generateTwoFactorSetupToken(userId: string, jwtSecret: string): string {
  return jwt.sign({ userId, purpose: TWO_FACTOR_TOKEN_PURPOSE.REQUIRED_SETUP }, jwtSecret, {
    expiresIn: TWO_FACTOR_SETUP_TOKEN_EXPIRY,
  });
}

export function generateTwoFactorLoginChallengeToken(userId: string, jwtSecret: string): string {
  return jwt.sign({ userId, purpose: TWO_FACTOR_TOKEN_PURPOSE.LOGIN_CHALLENGE }, jwtSecret, {
    expiresIn: TWO_FACTOR_LOGIN_CHALLENGE_TOKEN_EXPIRY,
  });
}

export function verifyTwoFactorLoginChallengeToken(
  tempToken: string | undefined,
  jwtSecret: string | undefined,
): string | undefined {
  if (!tempToken || !jwtSecret) {
    return undefined;
  }

  try {
    const payload = jwt.verify(tempToken, jwtSecret);
    if (
      typeof payload !== 'object' ||
      payload.purpose !== TWO_FACTOR_TOKEN_PURPOSE.LOGIN_CHALLENGE ||
      typeof payload.userId !== 'string' ||
      !payload.userId
    ) {
      return undefined;
    }
    return (payload as TwoFactorLoginChallengeClaims).userId;
  } catch {
    return undefined;
  }
}

export function generateTwoFactorSetupFinalizationToken(
  userId: string,
  nonce: string,
  jwtSecret: string,
): string {
  return jwt.sign(
    { userId, nonce, purpose: TWO_FACTOR_TOKEN_PURPOSE.REQUIRED_FINALIZATION },
    jwtSecret,
    { expiresIn: TWO_FACTOR_SETUP_FINALIZATION_TOKEN_EXPIRY },
  );
}

export function generateTwoFactorSetupAcknowledgementToken(
  userId: string,
  nonce: string,
  jwtSecret: string,
): string {
  return jwt.sign(
    { userId, nonce, purpose: TWO_FACTOR_TOKEN_PURPOSE.REQUIRED_ACKNOWLEDGEMENT },
    jwtSecret,
    { expiresIn: TWO_FACTOR_SETUP_ACKNOWLEDGEMENT_TOKEN_EXPIRY },
  );
}

function verifyEnrollmentCredential(
  token: string | undefined,
  jwtSecret: string | undefined,
  purpose: string,
): TwoFactorEnrollmentCredential | undefined {
  if (!token || !jwtSecret) {
    return undefined;
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    if (
      typeof payload !== 'object' ||
      payload.purpose !== purpose ||
      typeof payload.userId !== 'string' ||
      !payload.userId ||
      typeof payload.nonce !== 'string' ||
      !payload.nonce
    ) {
      return undefined;
    }
    return { userId: payload.userId, nonce: payload.nonce };
  } catch {
    return undefined;
  }
}

export function verifyTwoFactorSetupAcknowledgementToken(
  acknowledgementToken: string | undefined,
  jwtSecret: string | undefined,
): TwoFactorEnrollmentCredential | undefined {
  return verifyEnrollmentCredential(
    acknowledgementToken,
    jwtSecret,
    TWO_FACTOR_TOKEN_PURPOSE.REQUIRED_ACKNOWLEDGEMENT,
  );
}

export function verifyTwoFactorSetupFinalizationToken(
  finalizationToken: string | undefined,
  jwtSecret: string | undefined,
): TwoFactorEnrollmentCredential | undefined {
  return verifyEnrollmentCredential(
    finalizationToken,
    jwtSecret,
    TWO_FACTOR_TOKEN_PURPOSE.REQUIRED_FINALIZATION,
  );
}

export function verifyTwoFactorSetupToken(
  tempToken: string | undefined,
  jwtSecret: string | undefined,
): string | undefined {
  if (!tempToken || !jwtSecret) {
    return undefined;
  }

  try {
    const payload = jwt.verify(tempToken, jwtSecret);
    if (
      typeof payload !== 'object' ||
      payload.purpose !== TWO_FACTOR_TOKEN_PURPOSE.REQUIRED_SETUP ||
      typeof payload.userId !== 'string' ||
      !payload.userId
    ) {
      return undefined;
    }
    return (payload as TwoFactorSetupClaims).userId;
  } catch {
    return undefined;
  }
}

export function requireTwoFactorSetupToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Response | void {
  if (!isEnabled(process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION)) {
    return res.status(403).json({ message: 'Two-factor authentication setup is not required' });
  }

  const tempToken = (req.body as TwoFactorSetupBody | undefined)?.tempToken;
  const userId = verifyTwoFactorSetupToken(tempToken, process.env.JWT_SECRET);
  if (!userId) {
    return res.status(401).json({ message: 'Invalid or expired two-factor setup token' });
  }

  const setupRequest = req as TwoFactorEnrollmentRequest;
  setupRequest.user = { id: userId };
  next();
}

export function requireTwoFactorSetupFinalizationToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Response | void {
  if (!isEnabled(process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION)) {
    return res.status(403).json({ message: 'Two-factor authentication setup is not required' });
  }

  const finalizationToken = (req.body as TwoFactorSetupBody | undefined)?.finalizationToken;
  const credential = verifyTwoFactorSetupFinalizationToken(
    finalizationToken,
    process.env.JWT_SECRET,
  );
  if (!credential) {
    return res.status(401).json({ message: 'Invalid or expired two-factor finalization token' });
  }

  const setupRequest = req as TwoFactorEnrollmentRequest;
  setupRequest.user = { id: credential.userId };
  setupRequest.twoFactorEnrollmentNonce = credential.nonce;
  next();
}

export function requireTwoFactorSetupAcknowledgementToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Response | void {
  if (!isEnabled(process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION)) {
    return res.status(403).json({ message: 'Two-factor authentication setup is not required' });
  }

  const acknowledgementToken = (req.body as TwoFactorSetupBody | undefined)?.acknowledgementToken;
  const credential = verifyTwoFactorSetupAcknowledgementToken(
    acknowledgementToken,
    process.env.JWT_SECRET,
  );
  if (!credential) {
    return res.status(401).json({ message: 'Invalid or expired two-factor acknowledgement token' });
  }

  const setupRequest = req as TwoFactorEnrollmentRequest;
  setupRequest.user = { id: credential.userId };
  setupRequest.twoFactorEnrollmentNonce = credential.nonce;
  next();
}

export function blockTwoFactorDisableWhenRequired(
  req: Request,
  res: Response,
  next: NextFunction,
): Response | void {
  if (
    !isEnabled(process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION) ||
    !isTwoFactorPolicyProvider((req.user as Partial<Pick<IUser, 'provider'>> | undefined)?.provider)
  ) {
    next();
    return;
  }

  return res.status(403).json({
    message: 'Two-factor authentication is required and cannot be disabled',
  });
}

/**
 * Verifies the current pending TOTP secret and stages deliverable backup codes.
 *
 * Nothing is promoted here: `twoFactorEnabled` stays false and the live secret is untouched, so
 * every existing JWT and refresh session remains blocked until finalization. A lost response is
 * safe to retry with the same setup token and a current TOTP; each attempt rotates the pending
 * codes and mints a fresh acknowledgement nonce, invalidating any earlier one.
 */
export async function confirmTwoFactorSetup(
  userId: string,
  token: string | undefined,
  deps: TwoFactorEnrollmentDependencies,
): Promise<TwoFactorConfirmResult> {
  const user = await deps.getUserById(userId, TWO_FACTOR_ENROLLMENT_PROJECTION);
  if (!user || user.twoFactorEnabled || !isTwoFactorSetupEligible(user)) {
    return fail(TWO_FACTOR_SETUP_UNAVAILABLE);
  }
  if (!user.pendingTotpSecret || !user.pendingBackupCodes?.length) {
    return fail(TWO_FACTOR_SETUP_NOT_INITIATED);
  }
  if (!token) {
    return fail(TWO_FACTOR_INVALID_TOKEN);
  }

  const secret = await deps.getTOTPSecret(user.pendingTotpSecret);
  if (!secret) {
    return fail(TWO_FACTOR_SETUP_NOT_INITIATED);
  }
  if (!(await deps.verifyTOTP(secret, token))) {
    return fail(TWO_FACTOR_INVALID_TOKEN);
  }

  const { plainCodes, codeObjects } = await deps.generateBackupCodes();
  const acknowledgementNonce = createEnrollmentNonce();
  if (!isEnabled(process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION)) {
    return fail(TWO_FACTOR_SETUP_UNAVAILABLE);
  }

  const updatedUser = await deps.updateTwoFactorEnrollment(
    userId,
    {
      pendingTotpSecret: user.pendingTotpSecret,
      pendingBackupCodes: user.pendingBackupCodes,
    },
    {
      pendingBackupCodes: codeObjects,
      twoFactorAcknowledgementNonceHash: hashEnrollmentNonce(acknowledgementNonce),
      twoFactorFinalizationNonceHash: null,
    },
  );
  if (!updatedUser) {
    return fail(TWO_FACTOR_SETUP_UNAVAILABLE);
  }

  return { ok: true, user: updatedUser, plainCodes, acknowledgementNonce };
}

/**
 * Consumes the acknowledgement nonce the user was handed with their backup codes and issues a
 * finalization nonce in its place. Still no promotion and still no session.
 */
export async function acknowledgeTwoFactorSetup(
  userId: string,
  acknowledgementNonce: string | undefined,
  deps: TwoFactorEnrollmentDependencies,
): Promise<TwoFactorAcknowledgeResult> {
  if (!isEnabled(process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION)) {
    return fail(TWO_FACTOR_SETUP_UNAVAILABLE);
  }
  if (!acknowledgementNonce) {
    return fail(TWO_FACTOR_SETUP_STALE);
  }

  const finalizationNonce = createEnrollmentNonce();
  const updatedUser = await deps.updateTwoFactorEnrollment(
    userId,
    { twoFactorAcknowledgementNonceHash: hashEnrollmentNonce(acknowledgementNonce) },
    {
      twoFactorAcknowledgementNonceHash: null,
      twoFactorFinalizationNonceHash: hashEnrollmentNonce(finalizationNonce),
    },
  );
  if (!updatedUser) {
    return fail(TWO_FACTOR_SETUP_STALE);
  }

  return { ok: true, user: updatedUser, finalizationNonce };
}

/**
 * The only step that promotes. It consumes the finalization nonce, the exact pending secret, and
 * the exact pending backup-code snapshot in one compare-and-swap, after revalidating deployment
 * policy and provider eligibility. A replayed credential finds no nonce and writes nothing.
 */
export async function finalizeTwoFactorSetup(
  userId: string,
  finalizationNonce: string | undefined,
  deps: TwoFactorEnrollmentDependencies,
): Promise<TwoFactorFinalizeResult> {
  if (!finalizationNonce) {
    return fail(TWO_FACTOR_SETUP_STALE);
  }

  const user = await deps.getUserById(userId, TWO_FACTOR_ENROLLMENT_PROJECTION);
  if (!user || user.twoFactorEnabled || !isTwoFactorSetupEligible(user)) {
    return fail(TWO_FACTOR_SETUP_UNAVAILABLE);
  }
  if (!user.pendingTotpSecret || !user.pendingBackupCodes?.length) {
    return fail(TWO_FACTOR_SETUP_NOT_INITIATED);
  }
  if (!isEnabled(process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION)) {
    return fail(TWO_FACTOR_SETUP_UNAVAILABLE);
  }

  const updatedUser = await deps.updateTwoFactorEnrollment(
    userId,
    {
      pendingTotpSecret: user.pendingTotpSecret,
      pendingBackupCodes: user.pendingBackupCodes,
      twoFactorFinalizationNonceHash: hashEnrollmentNonce(finalizationNonce),
    },
    {
      totpSecret: user.pendingTotpSecret,
      backupCodes: user.pendingBackupCodes,
      twoFactorEnabled: true,
      pendingTotpSecret: null,
      pendingBackupCodes: [],
      twoFactorAcknowledgementNonceHash: null,
      twoFactorFinalizationNonceHash: null,
    },
  );
  if (!updatedUser) {
    return fail(TWO_FACTOR_SETUP_STALE);
  }

  return { ok: true, user: updatedUser };
}
