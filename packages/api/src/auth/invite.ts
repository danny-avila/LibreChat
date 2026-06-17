import { Types } from 'mongoose';
import { logger, hashToken, getRandomValues } from '@librechat/data-schemas';

export interface InviteDeps {
  createToken: (data: {
    userId: Types.ObjectId;
    email: string;
    token: string;
    type?: string;
    createdAt: number;
    expiresIn: number;
    tenantId?: string;
    metadata?: Map<string, unknown>;
  }) => Promise<unknown>;
  findToken: (filter: { token: string; email: string }) => Promise<unknown>;
}

export interface InviteOptions {
  role?: string;
  tenantId?: string;
  scope?: 'platform';
}

/** Creates a new user invite and returns the encoded token. */
export async function createInvite(
  email: string,
  deps: InviteDeps,
  options?: InviteOptions,
): Promise<string | { message: string }> {
  try {
    const token = await getRandomValues(32);
    const hash = await hashToken(token);
    const encodedToken = encodeURIComponent(token);
    const fakeUserId = new Types.ObjectId();
    const metadataEntries: [string, unknown][] = [];
    if (options?.role != null) {
      metadataEntries.push(['role', options.role]);
    }
    if (options?.scope != null) {
      metadataEntries.push(['scope', options.scope]);
    }
    const metadata =
      metadataEntries.length > 0 ? new Map<string, unknown>(metadataEntries) : undefined;

    await deps.createToken({
      userId: fakeUserId,
      email,
      type: 'invite',
      token: hash,
      createdAt: Date.now(),
      expiresIn: 604800,
      ...(options?.tenantId && { tenantId: options.tenantId }),
      ...(metadata && { metadata }),
    });

    return encodedToken;
  } catch (error) {
    logger.error('[createInvite] Error creating invite', error);
    return { message: 'Error creating invite' };
  }
}

/** Retrieves and validates a user invite by encoded token and email. */
export async function getInvite(
  encodedToken: string,
  email: string,
  deps: InviteDeps,
): Promise<unknown> {
  try {
    const token = decodeURIComponent(encodedToken);
    const hash = await hashToken(token);
    const invite = await deps.findToken({ token: hash, email });

    if (!invite) {
      throw new Error('Invite not found or email does not match');
    }

    return invite;
  } catch (error) {
    logger.error('[getInvite] Error getting invite:', error);
    return { error: true, message: (error as Error).message };
  }
}
