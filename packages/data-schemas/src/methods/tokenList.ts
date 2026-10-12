import type { IToken } from '~/types';

/** A user holds a handful of tokens of one type at most; the bound keeps a read cheap regardless. */
const MAX_TOKENS_OF_USER = 100;

export interface TokenListMethods {
  /** Every token of one type a user holds, such as one per connected provider host. */
  findTokensOfUser(query: { userId: string; type: string }): Promise<IToken[]>;
}

export function createTokenListMethods(mongoose: typeof import('mongoose')): TokenListMethods {
  async function findTokensOfUser(query: { userId: string; type: string }): Promise<IToken[]> {
    const Token = mongoose.models.Token;
    return Token.find({ userId: query.userId, type: query.type })
      .limit(MAX_TOKENS_OF_USER)
      .lean<IToken[]>();
  }
  return { findTokensOfUser };
}
