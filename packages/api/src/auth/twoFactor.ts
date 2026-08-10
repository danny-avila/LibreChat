import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import type { IUser } from '@librechat/data-schemas';
import { isEnabled } from '~/utils';

const TWO_FACTOR_SETUP_TOKEN_EXPIRY = '10m';
const TWO_FACTOR_SETUP_UNAVAILABLE = '2FA setup is not available for this user';

interface TwoFactorSetupClaims {
  userId: string;
  twoFASetupRequired: true;
}

interface TwoFactorSetupBody {
  tempToken?: string;
}

export type TwoFactorSetupUser = Pick<
  IUser,
  '_id' | 'twoFactorEnabled' | 'pendingTotpSecret' | 'pendingBackupCodes'
>;

interface TwoFactorSetupUpdate {
  totpSecret: string;
  backupCodes: NonNullable<IUser['pendingBackupCodes']>;
  twoFactorEnabled: true;
  pendingTotpSecret: null;
  pendingBackupCodes: [];
}

export interface TwoFactorSetupDependencies {
  getUserById: (userId: string, projection: string) => Promise<TwoFactorSetupUser | null>;
  getTOTPSecret: (storedSecret: string) => Promise<string | null>;
  verifyTOTP: (secret: string, token: string) => Promise<boolean>;
  updateUser: (userId: string, update: TwoFactorSetupUpdate) => Promise<TwoFactorSetupUser | null>;
}

export type TwoFactorSetupResult =
  | { ok: true; user: TwoFactorSetupUser }
  | { ok: false; status: 400; message: string };

export function generateTwoFactorSetupToken(userId: string, jwtSecret: string): string {
  return jwt.sign({ userId, twoFASetupRequired: true }, jwtSecret, {
    expiresIn: TWO_FACTOR_SETUP_TOKEN_EXPIRY,
  });
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
      payload.twoFASetupRequired !== true ||
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

  const setupRequest = req as typeof req & { user?: { id: string } };
  setupRequest.user = { id: userId };
  next();
}

export function blockTwoFactorDisableWhenRequired(
  _req: Request,
  res: Response,
  next: NextFunction,
): Response | void {
  if (!isEnabled(process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION)) {
    next();
    return;
  }

  return res.status(403).json({
    message: 'Two-factor authentication is required and cannot be disabled',
  });
}

export async function confirmTwoFactorSetup(
  userId: string,
  token: string | undefined,
  deps: TwoFactorSetupDependencies,
): Promise<TwoFactorSetupResult> {
  const user = await deps.getUserById(
    userId,
    '+pendingTotpSecret +pendingBackupCodes _id twoFactorEnabled',
  );
  if (!user || user.twoFactorEnabled) {
    return { ok: false, status: 400, message: TWO_FACTOR_SETUP_UNAVAILABLE };
  }
  if (!user.pendingTotpSecret) {
    return { ok: false, status: 400, message: '2FA setup not initiated' };
  }
  if (!token) {
    return { ok: false, status: 400, message: 'Invalid token' };
  }

  const secret = await deps.getTOTPSecret(user.pendingTotpSecret);
  if (!secret) {
    return { ok: false, status: 400, message: '2FA setup not initiated' };
  }
  if (!(await deps.verifyTOTP(secret, token))) {
    return { ok: false, status: 400, message: 'Invalid token' };
  }

  const updatedUser = await deps.updateUser(userId, {
    totpSecret: user.pendingTotpSecret,
    backupCodes: user.pendingBackupCodes ?? [],
    twoFactorEnabled: true,
    pendingTotpSecret: null,
    pendingBackupCodes: [],
  });
  if (!updatedUser) {
    return { ok: false, status: 400, message: TWO_FACTOR_SETUP_UNAVAILABLE };
  }

  return { ok: true, user: updatedUser };
}
