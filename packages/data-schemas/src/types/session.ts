import type { Document, Types } from 'mongoose';

export interface ISession extends Document {
  refreshTokenHash: string;
  expiration: Date;
  user: Types.ObjectId;
  /** Organizations mode: the login account behind the member in `user`. */
  identity?: Types.ObjectId;
  tenantId?: string;
}

export interface CreateSessionOptions {
  expiration?: Date;
  /** Duration in milliseconds for session expiry. Default: 7 days */
  expiresIn?: number;
  /** Organizations mode: the login account behind the member the session is for. */
  identityId?: string;
}

export interface UpsertSessionOptions {
  expiration: Date;
  tenantId?: string;
}

export interface SessionSearchParams {
  refreshToken?: string;
  userId?: string;
  sessionId?: string | { sessionId: string };
}

export interface SessionQueryOptions {
  lean?: boolean;
}

export interface DeleteSessionParams {
  refreshToken?: string;
  sessionId?: string;
}

export interface DeleteAllSessionsOptions {
  excludeCurrentSession?: boolean;
  currentSessionId?: string;
}

export interface SessionResult {
  session: Partial<ISession>;
  refreshToken: string;
}

export interface SignPayloadParams {
  payload: Record<string, unknown>;
  secret?: string;
  expirationTime: number;
}
