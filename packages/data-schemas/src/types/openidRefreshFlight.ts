import type { Document } from 'mongoose';

export type OpenIDRefreshFlightStatus = 'pending' | 'completed' | 'failed' | 'revoked';

export interface IOpenIDRefreshFlight extends Document {
  key: string;
  ownerId: string;
  status: OpenIDRefreshFlightStatus;
  encryptedResult?: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
  lockExpiresAt: Date;
  expiresAt: Date;
}

export interface OpenIDRefreshFlightCreateData {
  key: string;
  ownerId: string;
  lockExpiresAt: Date;
  expiresAt: Date;
}

export interface OpenIDRefreshFlightCompleteData {
  key: string;
  ownerId: string;
  encryptedResult: string;
  expiresAt: Date;
}

export interface OpenIDRefreshFlightRenewData {
  key: string;
  ownerId: string;
  lockExpiresAt: Date;
  expiresAt: Date;
}

export interface OpenIDRefreshFlightFailData {
  key: string;
  ownerId: string;
  errorMessage: string;
  expiresAt: Date;
}

export interface OpenIDRefreshFlightRevokeData {
  key: string;
  expiresAt: Date;
}

export interface OpenIDRefreshFlightQuery {
  key: string;
}

export interface OpenIDRefreshFlightAcquireResult {
  acquired: boolean;
  flight: IOpenIDRefreshFlight | null;
}
