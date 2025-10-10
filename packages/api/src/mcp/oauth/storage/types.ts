import type { TokenCreateData, TokenMethods } from '@librechat/data-schemas';
import type { TAwsTokenStoreConfig, TokenStoreBackend } from 'librechat-data-provider';

export type MCPTokenMethods = Pick<
  TokenMethods,
  'findToken' | 'createToken' | 'updateToken' | 'deleteTokens'
>;

export interface TokenMethodFactoryOptions {
  awsConfig?: TAwsTokenStoreConfig;
  retry?: RetryOptions;
}

export interface RetryOptions {
  maxAttempts?: number;
  backoffMs?: number;
}

export interface TokenDataEnvelope {
  userId: string;
  identifier?: string;
  type?: string;
  token: string;
  createdAt: Date;
  expiresAt: Date;
  metadata?: Map<string, unknown> | Record<string, unknown> | null;
}

export interface TokenRecordPayload {
  userId: string;
  identifier?: string;
  type?: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  metadata?: Record<string, unknown>;
  encrypted?: boolean;
}

export type TokenStoreBackendOption = TokenStoreBackend;

export interface ConfigureTokenStoreParams {
  backend: TokenStoreBackendOption;
  encryptBeforeStore: boolean;
  tokenMethods: MCPTokenMethods;
  awsConfig?: TAwsTokenStoreConfig;
  retry?: RetryOptions;
}

export interface TokenConversions {
  toRecord: (
    token: TokenCreateData,
    createdAt: Date,
    expiresAt: Date,
    encrypted: boolean,
  ) => TokenRecordPayload;
  toToken: (record: TokenRecordPayload) => TokenDataEnvelope;
}

export type TokenMethodFactory = (options: TokenMethodFactoryOptions) => MCPTokenMethods;

export interface AwsBaseOptions {
  prefix: string;
  region?: string;
  kmsKeyId?: string;
  retry?: RetryOptions;
}

export type AwsTokenRecord = TokenRecordPayload;
