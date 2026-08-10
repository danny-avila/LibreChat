import type { QueryOptions } from 'mongoose';
import type {
  IToken,
  TokenQuery,
  TokenCreateData,
  TokenUpdateData,
  TokenDeleteResult,
  TokenIdentityRecord,
} from '~/types';
import {
  MCP_AUTHORITY_OAUTH_TOKEN_TYPES,
  isMCPAuthorityOAuthTokenType,
} from './mcpAuthority/classification';
import {
  getMCPAuthorityConsistencyModule,
  runMCPAuthorityMutation,
} from './mcpAuthority/consistency';
import logger from '~/config/winston';

function selectorCanMatchMCPAuthority(type: TokenQuery['type']): boolean {
  if (typeof type === 'string') {
    return isMCPAuthorityOAuthTokenType(type);
  }
  if (type instanceof RegExp) {
    const stableExpression = new RegExp(type.source, type.flags.replace(/[gy]/g, ''));
    return MCP_AUTHORITY_OAUTH_TOKEN_TYPES.some((candidate) => stableExpression.test(candidate));
  }
  if (type && typeof type === 'object') {
    return type.$in.some(isMCPAuthorityOAuthTokenType);
  }
  return true;
}

// Factory function that takes mongoose instance and returns the methods
export function createTokenMethods(mongoose: typeof import('mongoose')): {
  findToken: (query: TokenQuery, options?: QueryOptions) => Promise<IToken | null>;
  findTokens?: (query: TokenQuery) => Promise<TokenIdentityRecord[]>;
  createToken: (tokenData: TokenCreateData) => Promise<IToken>;
  updateToken: (query: TokenQuery, updateData: TokenUpdateData) => Promise<IToken | null>;
  deleteTokens: (query: TokenQuery) => Promise<TokenDeleteResult>;
} {
  const authorityMutationGate = getMCPAuthorityConsistencyModule(mongoose);
  /**
   * Creates a new Token instance.
   */
  async function createToken(tokenData: TokenCreateData): Promise<IToken> {
    try {
      const Token = mongoose.models.Token;
      const currentTime = new Date();
      const expiresAt = new Date(currentTime.getTime() + tokenData.expiresIn * 1000);

      const newTokenData = {
        ...tokenData,
        createdAt: currentTime,
        expiresAt,
      };

      return await Token.create(newTokenData);
    } catch (error) {
      logger.debug('An error occurred while creating token:', error);
      throw error;
    }
  }

  /**
   * Updates a Token document that matches the provided query.
   */
  async function updateToken(
    query: TokenQuery,
    updateData: TokenUpdateData,
  ): Promise<IToken | null> {
    try {
      const Token = mongoose.models.Token;
      const { metadataCredentialSetId, ...tokenQuery } = query;
      const dbQuery: Record<string, unknown> = { ...tokenQuery };
      if (metadataCredentialSetId !== undefined) {
        dbQuery['metadata.credential_set_id'] = metadataCredentialSetId;
      }

      const dataToUpdate = { ...updateData };
      if (updateData?.expiresIn !== undefined) {
        dataToUpdate.expiresAt = new Date(Date.now() + updateData.expiresIn * 1000);
      }

      return await Token.findOneAndUpdate(dbQuery, dataToUpdate, { new: true });
    } catch (error) {
      logger.debug('An error occurred while updating token:', error);
      throw error;
    }
  }

  /** Deletes all Token documents matching every provided field (AND semantics). */
  async function deleteTokens(query: TokenQuery): Promise<TokenDeleteResult> {
    try {
      const Token = mongoose.models.Token;
      const conditions = [];

      if (query.userId !== undefined) {
        conditions.push({ userId: query.userId });
      }
      if (query.token !== undefined) {
        conditions.push({ token: query.token });
      }
      if (query.email !== undefined) {
        const email = query.email === null ? null : query.email.trim().toLowerCase();
        conditions.push({ email });
      }
      if (query.type !== undefined) {
        conditions.push({ type: query.type });
      }
      if (query.identifier !== undefined) {
        conditions.push({ identifier: query.identifier });
      }
      if (query.metadataCredentialSetId !== undefined) {
        conditions.push({ 'metadata.credential_set_id': query.metadataCredentialSetId });
      }

      if (conditions.length === 0) {
        throw new Error('At least one query parameter must be provided');
      }

      return await Token.deleteMany({
        $and: conditions,
      });
    } catch (error) {
      logger.debug('An error occurred while deleting tokens:', error);
      throw error;
    }
  }

  /**
   * Finds a Token document that matches the provided query.
   * Email is automatically normalized to lowercase for case-insensitive matching.
   */
  async function findToken(query: TokenQuery, options?: QueryOptions): Promise<IToken | null> {
    try {
      const Token = mongoose.models.Token;
      const conditions = [];

      if (query.userId) {
        conditions.push({ userId: query.userId });
      }
      if (query.token) {
        conditions.push({ token: query.token });
      }
      if (query.email !== undefined) {
        const email = query.email === null ? null : query.email.trim().toLowerCase();
        conditions.push({ email });
      }
      if (query.type !== undefined) {
        conditions.push({ type: query.type });
      }
      if (query.identifier !== undefined) {
        conditions.push({ identifier: query.identifier });
      }
      if (query.metadataCredentialSetId !== undefined) {
        conditions.push({ 'metadata.credential_set_id': query.metadataCredentialSetId });
      }

      const token = await Token.findOne({ $and: conditions }, null, options).lean();

      return token as IToken | null;
    } catch (error) {
      logger.debug('An error occurred while finding token:', error);
      throw error;
    }
  }

  /** Finds non-secret token identity metadata matching the provided query. */
  async function findTokens(query: TokenQuery): Promise<TokenIdentityRecord[]> {
    try {
      const Token = mongoose.models.Token;
      const conditions = [];

      if (query.userId) {
        conditions.push({ userId: query.userId });
      }
      if (query.token) {
        conditions.push({ token: query.token });
      }
      if (query.email !== undefined) {
        const email = query.email === null ? null : query.email.trim().toLowerCase();
        conditions.push({ email });
      }
      if (query.type !== undefined) {
        conditions.push({ type: query.type });
      }
      if (query.identifier !== undefined) {
        conditions.push({ identifier: query.identifier });
      }
      if (query.metadataCredentialSetId !== undefined) {
        conditions.push({ 'metadata.credential_set_id': query.metadataCredentialSetId });
      }

      if (conditions.length === 0) {
        throw new Error('At least one query parameter must be provided');
      }

      return await Token.find({ $and: conditions })
        .sort({ createdAt: -1, _id: -1 })
        .select('_id type identifier createdAt metadata.credential_set_id')
        .lean<TokenIdentityRecord[]>();
    } catch (error) {
      logger.debug('An error occurred while finding tokens:', error);
      throw error;
    }
  }

  // Return all methods
  return {
    findToken,
    findTokens,
    createToken: async (tokenData) => {
      if (!isMCPAuthorityOAuthTokenType(tokenData.type)) {
        return await createToken(tokenData);
      }
      return await runMCPAuthorityMutation(authorityMutationGate, () => createToken(tokenData));
    },
    updateToken: async (query, updateData) => {
      const affectsMCPAuthority =
        isMCPAuthorityOAuthTokenType(updateData.type) || selectorCanMatchMCPAuthority(query.type);
      if (!affectsMCPAuthority) {
        return await updateToken(query, updateData);
      }
      return await runMCPAuthorityMutation(authorityMutationGate, () =>
        updateToken(query, updateData),
      );
    },
    deleteTokens: async (query) => {
      if (!selectorCanMatchMCPAuthority(query.type)) {
        return await deleteTokens(query);
      }
      return await runMCPAuthorityMutation(authorityMutationGate, () => deleteTokens(query));
    },
  };
}

export type TokenMethods = ReturnType<typeof createTokenMethods>;
