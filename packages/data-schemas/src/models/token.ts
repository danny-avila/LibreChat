import mongoose from 'mongoose';
import tokenSchema from '~/schema/token';
import type * as t from '~/types';

export const Token = mongoose.models.Token || mongoose.model<t.IToken>('Token', tokenSchema);
