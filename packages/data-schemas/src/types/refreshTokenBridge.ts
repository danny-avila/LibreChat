import type { Document } from 'mongoose';

export interface IRefreshTokenBridge extends Document {
  oldRefreshTokenHash: string;
  encryptedNewRefreshToken: string;
  userId: string;
  tenantId?: string;
  openidIssuer?: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface RefreshTokenBridgeCreateData {
  oldRefreshTokenHash: string;
  encryptedNewRefreshToken: string;
  userId: string;
  tenantId?: string;
  openidIssuer?: string;
  expiresAt: Date;
}

export interface RefreshTokenBridgeQuery {
  oldRefreshTokenHash: string;
  userId: string;
  tenantId?: string;
}
