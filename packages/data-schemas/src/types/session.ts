import type { Document, Types } from 'mongoose';

export interface ISession extends Document {
  refreshTokenHash: string;
  expiration: Date;
  user: Types.ObjectId;
}

export interface CreateSessionOptions {
  expiration?: Date;
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
