import { IToken, TokenCreateData, TokenQuery, TokenUpdateData, TokenDeleteResult } from '~/types';
import logger from '~/config/winston';

// Factory function that takes mongoose instance and returns the methods
export function createTokenMethods(mongoose: typeof import('mongoose')) {
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
      return await Token.findOneAndUpdate(query, updateData, { new: true });
    } catch (error) {
      logger.debug('An error occurred while updating token:', error);
      throw error;
    }
  }

  /**
   * Deletes all Token documents that match the provided token, user ID, or email.
   */
  async function deleteTokens(query: TokenQuery): Promise<TokenDeleteResult> {
    try {
      const Token = mongoose.models.Token;
      return await Token.deleteMany({
        $or: [
          { userId: query.userId },
          { token: query.token },
          { email: query.email },
          { identifier: query.identifier },
        ],
      });
    } catch (error) {
      logger.debug('An error occurred while deleting tokens:', error);
      throw error;
    }
  }

  /**
   * Finds a Token document that matches the provided query.
   */
  async function findToken(query: TokenQuery): Promise<IToken | null> {
    try {
      const Token = mongoose.models.Token;
      const conditions = [];

      if (query.userId) {
        conditions.push({ userId: query.userId });
      }
      if (query.token) {
        conditions.push({ token: query.token });
      }
      if (query.email) {
        conditions.push({ email: query.email });
      }
      if (query.identifier) {
        conditions.push({ identifier: query.identifier });
      }

      const token = await Token.findOne({
        $and: conditions,
      }).lean();

      return token as IToken | null;
    } catch (error) {
      logger.debug('An error occurred while finding token:', error);
      throw error;
    }
  }

  // Return all methods
  return {
    findToken,
    createToken,
    updateToken,
    deleteTokens,
  };
}

export type TokenMethods = ReturnType<typeof createTokenMethods>;
