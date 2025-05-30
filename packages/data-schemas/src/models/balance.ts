import mongoose from 'mongoose';
import balanceSchema from '~/schema/balance';
import type * as t from '~/types';

export const Balance =
  mongoose.models.Balance || mongoose.model<t.IBalance>('Balance', balanceSchema);
