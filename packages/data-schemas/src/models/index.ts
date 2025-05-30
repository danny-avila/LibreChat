import mongoose from 'mongoose';

// Import schemas
import userSchema from '~/schema/user';
import sessionSchema from '~/schema/session';
import tokenSchema from '~/schema/token';
import balanceSchema from '~/schema/balance';

// Import types
import { IUser, ISession, IToken } from '~/types';
import { IBalance } from '~/schema/balance';

// Create and export model instances
export const User = mongoose.model<IUser>('User', userSchema);
export const Session = mongoose.model<ISession>('Session', sessionSchema);
export const Token = mongoose.model<IToken>('Token', tokenSchema);
export const Balance = mongoose.model<IBalance>('Balance', balanceSchema);

// Default export with all models
export default {
  User,
  Session,
  Token,
  Balance,
};
