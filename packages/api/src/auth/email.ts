import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { logger, hashToken, getRandomValues, isValidObjectIdString } from '@librechat/data-schemas';
import type { IUser, IToken, TokenCreateData, TokenQuery } from '@librechat/data-schemas';
import type { EmailChangeErrorCode } from 'librechat-data-provider';
import { isEmailDomainAllowed } from './domain';
import { isEnabled } from '../utils/common';

export type { EmailChangeErrorCode } from 'librechat-data-provider';

export const EMAIL_CHANGE_TOKEN_TYPE = 'email_change';
const PASSWORD_RESET_TOKEN_TYPE = 'password_reset';

export function isEmailChangeAllowed(
  value: string | undefined = process.env.ALLOW_EMAIL_CHANGE,
): boolean {
  return value === undefined || isEnabled(value);
}

const EMAIL_CHANGE_TOKEN_TTL_SECONDS = 15 * 60;
const EMAIL_CHANGE_ERROR_MESSAGE = 'Invalid or expired email change request';

const requestSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newEmail: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((email) => email.toLowerCase()),
});

const confirmSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((email) => email.toLowerCase()),
  token: z.string().min(1),
  userId: z.string().refine(isValidObjectIdString),
});

export type EmailChangeUser = Pick<IUser, 'email'> &
  Partial<Pick<IUser, 'id' | 'name' | 'username' | 'password' | 'provider' | 'tenantId'>> & {
    _id?: IUser['_id'] | string;
  };

export type EmailChangeToken = Pick<IToken, 'token'> &
  Partial<
    Pick<IToken, 'email' | 'scope' | 'identifier' | 'expiresAt' | 'metadata' | 'tenantId'>
  > & {
    userId: IToken['userId'] | string;
  };

interface EmailData {
  email: string;
  subject: string;
  payload: Record<string, string>;
  template: string;
}

export interface EmailChangeDeps {
  findUserByEmail: (email: string, tenantId?: string) => Promise<EmailChangeUser | null>;
  getUserById: (userId: string, tenantId?: string) => Promise<EmailChangeUser | null>;
  updateUser: (
    userId: string,
    update: Pick<EmailChangeUser, 'email'> & { emailVerified: boolean },
    expectedState: Pick<EmailChangeUser, 'email' | 'password'>,
    tenantId?: string,
  ) => Promise<EmailChangeUser | null>;
  findToken: (query: TokenQuery, tenantId?: string) => Promise<EmailChangeToken | null>;
  upsertToken: (scope: string, data: TokenCreateData, tenantId?: string) => Promise<void>;
  deleteTokens: (query: TokenQuery, tenantId?: string) => Promise<{ deletedCount?: number }>;
  verifyPassword: (user: EmailChangeUser, password: string) => Promise<boolean>;
  sendEmail: (data: EmailData) => Promise<void>;
  isEmailChangeAllowed: () => boolean;
  clientDomain: string;
  appName: string;
}

export interface EmailChangeResult {
  status: number;
  message: string;
  code?: EmailChangeErrorCode;
}

export interface RequestEmailChangeInput {
  body: {
    currentPassword?: string;
    newEmail?: string;
  };
  userId: string;
  tenantId?: string;
  allowedDomains?: string[] | null;
  emailEnabled: boolean;
  ip?: string;
}

export interface ConfirmEmailChangeInput {
  body: {
    email?: string;
    token?: string;
    userId?: string;
  };
  ip?: string;
}

function result(status: number, message: string, code?: EmailChangeErrorCode): EmailChangeResult {
  return { status, message, ...(code ? { code } : {}) };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function userIdOf(user: EmailChangeUser): string | undefined {
  const userId = user._id ?? user.id;
  return userId?.toString();
}

function displayName(user: EmailChangeUser): string {
  return user.name || user.username || user.email;
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

async function tokenMatches(candidate: string, storedHash: string): Promise<boolean> {
  const candidateHash = await hashToken(candidate);
  const candidateBuffer = Buffer.from(candidateHash, 'hex');
  const storedBuffer = Buffer.from(storedHash, 'hex');
  return (
    candidateBuffer.length === storedBuffer.length && timingSafeEqual(candidateBuffer, storedBuffer)
  );
}

async function sendSecurityNotification(
  deps: EmailChangeDeps,
  data: EmailData,
  logContext: string,
): Promise<void> {
  try {
    await deps.sendEmail(data);
  } catch (error) {
    logger.error(`[emailChange] Failed to send ${logContext} notification`, error);
  }
}

function verificationLink(
  deps: EmailChangeDeps,
  userId: string,
  email: string,
  token: string,
): string {
  const query = new URLSearchParams({
    type: 'email-change',
    userId,
    email,
    token,
  });
  return `${deps.clientDomain.replace(/\/$/, '')}/verify?${query.toString()}`;
}

function emailChangeTokenScope(userId: string): string {
  return `${EMAIL_CHANGE_TOKEN_TYPE}:${userId}`;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}

function isTokenExpired(token: EmailChangeToken): boolean {
  if (!token.expiresAt) {
    return true;
  }
  const expiresAt = new Date(token.expiresAt).getTime();
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
}

function tokenMetadataValue(token: EmailChangeToken, key: string): unknown {
  if (token.metadata instanceof Map) {
    return token.metadata.get(key);
  }
  return token.metadata?.[key];
}

async function deleteTokensOrLog(
  deps: EmailChangeDeps,
  query: TokenQuery,
  tenantId: string | undefined,
  context: string,
): Promise<void> {
  try {
    await deps.deleteTokens(query, tenantId);
  } catch (error) {
    logger.error(`[emailChange] Failed to clean up ${context}`, error);
  }
}

export function createEmailChangeService(deps: EmailChangeDeps): {
  requestEmailChange: (input: RequestEmailChangeInput) => Promise<EmailChangeResult>;
  confirmEmailChange: (input: ConfirmEmailChangeInput) => Promise<EmailChangeResult>;
} {
  async function requestEmailChange(input: RequestEmailChangeInput): Promise<EmailChangeResult> {
    if (!deps.isEmailChangeAllowed()) {
      logger.warn(
        `[emailChange] Rejected disabled request [User ID: ${input.userId}] [IP: ${input.ip ?? 'unknown'}]`,
      );
      return result(403, 'Email changes are disabled', 'email_change_disabled');
    }

    const parsed = requestSchema.safeParse(input.body);
    if (!parsed.success) {
      return result(400, 'A valid new email and current password are required', 'invalid_request');
    }

    if (!input.emailEnabled) {
      return result(503, 'Email delivery is not configured', 'email_service_unavailable');
    }

    const user = await deps.getUserById(input.userId, input.tenantId);
    const userId = user ? userIdOf(user) : undefined;
    if (!user || !userId || user.provider !== 'local' || !user.password) {
      logger.warn(
        `[emailChange] Rejected non-local account request [User ID: ${input.userId}] [IP: ${input.ip ?? 'unknown'}]`,
      );
      return result(
        403,
        'Email changes are only available for local accounts',
        'local_account_required',
      );
    }

    const oldEmail = normalizeEmail(user.email);
    const newEmail = parsed.data.newEmail;
    if (newEmail === oldEmail) {
      return result(400, 'New email must be different from the current email', 'same_email');
    }

    const ip = input.ip ?? 'unknown';
    logger.info(
      `[emailChange] Change requested [User ID: ${userId}] [New Email: ${newEmail}] [IP: ${ip}]`,
    );
    await sendSecurityNotification(
      deps,
      {
        email: oldEmail,
        subject: 'Email change requested',
        payload: {
          appName: deps.appName,
          name: displayName(user),
          newEmail,
          ip,
          requestedAt: formatTimestamp(),
        },
        template: 'emailChangeAttempt.handlebars',
      },
      'email change attempt',
    );

    const passwordMatches = await deps.verifyPassword(user, parsed.data.currentPassword);
    if (!passwordMatches) {
      logger.warn(
        `[emailChange] Incorrect password [User ID: ${userId}] [New Email: ${newEmail}] [IP: ${ip}]`,
      );
      return result(403, 'Current password is incorrect', 'current_password_invalid');
    }

    if (!isEmailDomainAllowed(newEmail, input.allowedDomains)) {
      logger.warn(
        `[emailChange] Domain not allowed [User ID: ${userId}] [New Email: ${newEmail}] [IP: ${ip}]`,
      );
      return result(403, 'Email domain is not allowed', 'email_domain_not_allowed');
    }

    const existingUser = await deps.findUserByEmail(newEmail, user.tenantId);
    if (existingUser && userIdOf(existingUser) !== userId) {
      logger.warn(
        `[emailChange] Email already in use [User ID: ${userId}] [New Email: ${newEmail}] [IP: ${ip}]`,
      );
      return result(409, 'Email address is already linked to another account', 'email_in_use');
    }

    const rawToken = await getRandomValues(32);
    const tokenHash = await hashToken(rawToken);
    const passwordFingerprint = await hashToken(user.password);
    const tokenScope = emailChangeTokenScope(userId);
    const tokenQuery = {
      userId,
      email: newEmail,
      type: EMAIL_CHANGE_TOKEN_TYPE,
      token: tokenHash,
    };

    await deps.upsertToken(
      tokenScope,
      {
        userId,
        email: newEmail,
        scope: tokenScope,
        identifier: oldEmail,
        type: EMAIL_CHANGE_TOKEN_TYPE,
        token: tokenHash,
        expiresIn: EMAIL_CHANGE_TOKEN_TTL_SECONDS,
        metadata: { requestIp: ip, passwordFingerprint },
      },
      user.tenantId,
    );

    try {
      await deps.sendEmail({
        email: newEmail,
        subject: 'Verify your new email address',
        payload: {
          appName: deps.appName,
          name: displayName(user),
          newEmail,
          verificationLink: verificationLink(deps, userId, newEmail, rawToken),
          year: new Date().getFullYear().toString(),
        },
        template: 'verifyEmailChange.handlebars',
      });
    } catch (error) {
      await deps.deleteTokens(tokenQuery, user.tenantId);
      logger.error(
        `[emailChange] Verification delivery failed [User ID: ${userId}] [New Email: ${newEmail}] [IP: ${ip}]`,
        error,
      );
      return result(500, 'Failed to send verification email', 'email_delivery_failed');
    }

    logger.info(
      `[emailChange] Verification issued [User ID: ${userId}] [New Email: ${newEmail}] [IP: ${ip}]`,
    );
    return result(200, 'Verification link sent to your new email address');
  }

  async function confirmEmailChange(input: ConfirmEmailChangeInput): Promise<EmailChangeResult> {
    if (!deps.isEmailChangeAllowed()) {
      logger.warn(`[emailChange] Rejected disabled confirmation [IP: ${input.ip ?? 'unknown'}]`);
      return result(403, 'Email changes are disabled', 'email_change_disabled');
    }

    const parsed = confirmSchema.safeParse(input.body);
    if (!parsed.success) {
      return result(400, EMAIL_CHANGE_ERROR_MESSAGE, 'invalid_token');
    }

    const { email, token, userId } = parsed.data;
    const ip = input.ip ?? 'unknown';
    const scope = emailChangeTokenScope(userId);
    const tokenQuery = { userId, email, type: EMAIL_CHANGE_TOKEN_TYPE, scope };
    const emailChangeToken = await deps.findToken(tokenQuery);

    if (
      !emailChangeToken ||
      isTokenExpired(emailChangeToken) ||
      !(await tokenMatches(token, emailChangeToken.token))
    ) {
      logger.warn(
        `[emailChange] Invalid confirmation [User ID: ${userId}] [New Email: ${email}] [IP: ${ip}]`,
      );
      return result(400, EMAIL_CHANGE_ERROR_MESSAGE, 'invalid_token');
    }

    const tenantId = emailChangeToken.tenantId;
    const user = await deps.getUserById(userId, tenantId);
    const oldEmail = user ? normalizeEmail(user.email) : '';
    const passwordFingerprint = tokenMetadataValue(emailChangeToken, 'passwordFingerprint');
    if (
      !user ||
      userIdOf(user) !== userId ||
      !user.password ||
      typeof passwordFingerprint !== 'string' ||
      !(await tokenMatches(user.password, passwordFingerprint)) ||
      emailChangeToken.scope !== scope ||
      normalizeEmail(emailChangeToken.email ?? '') !== email ||
      normalizeEmail(emailChangeToken.identifier ?? '') !== oldEmail
    ) {
      logger.warn(
        `[emailChange] Stale confirmation [User ID: ${userId}] [New Email: ${email}] [IP: ${ip}]`,
      );
      return result(400, EMAIL_CHANGE_ERROR_MESSAGE, 'invalid_token');
    }

    const existingUser = await deps.findUserByEmail(email, tenantId);
    if (existingUser && userIdOf(existingUser) !== userId) {
      return result(409, 'Email address is already linked to another account', 'email_in_use');
    }

    const consumed = await deps.deleteTokens(
      { ...tokenQuery, token: emailChangeToken.token },
      tenantId,
    );
    if (consumed.deletedCount !== 1) {
      return result(400, EMAIL_CHANGE_ERROR_MESSAGE, 'invalid_token');
    }

    try {
      await Promise.all([
        deps.deleteTokens({ userId, type: PASSWORD_RESET_TOKEN_TYPE }, tenantId),
        deps.deleteTokens({ userId, email: null, identifier: null, type: null }, tenantId),
      ]);
    } catch (error) {
      logger.error(
        `[emailChange] Credential cleanup failed [User ID: ${userId}] [New Email: ${email}] [IP: ${ip}]`,
        error,
      );
      return result(500, 'Failed to change email address');
    }

    try {
      const updatedUser = await deps.updateUser(
        userId,
        { email, emailVerified: true },
        { email: oldEmail, password: user.password },
        tenantId,
      );
      if (!updatedUser) {
        return result(400, EMAIL_CHANGE_ERROR_MESSAGE, 'invalid_token');
      }
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return result(409, 'Email address is already linked to another account', 'email_in_use');
      }
      logger.error(
        `[emailChange] Update failed [User ID: ${userId}] [New Email: ${email}] [IP: ${ip}]`,
        error,
      );
      return result(500, 'Failed to change email address');
    }

    await deleteTokensOrLog(
      deps,
      { userId, type: EMAIL_CHANGE_TOKEN_TYPE },
      tenantId,
      'superseded email change tokens',
    );
    const confirmationPayload = {
      appName: deps.appName,
      name: displayName(user),
      oldEmail,
      newEmail: email,
      ip,
      changedAt: formatTimestamp(),
    };
    await Promise.all([
      sendSecurityNotification(
        deps,
        {
          email: oldEmail,
          subject: 'Your email address was changed',
          payload: confirmationPayload,
          template: 'emailChanged.handlebars',
        },
        'old-address confirmation',
      ),
      sendSecurityNotification(
        deps,
        {
          email,
          subject: 'Your email address was changed',
          payload: confirmationPayload,
          template: 'emailChanged.handlebars',
        },
        'new-address confirmation',
      ),
    ]);

    logger.info(
      `[emailChange] Change completed [User ID: ${userId}] [Old Email: ${oldEmail}] [New Email: ${email}] [IP: ${ip}]`,
    );
    return result(200, 'Email address changed successfully');
  }

  return { requestEmailChange, confirmEmailChange };
}
