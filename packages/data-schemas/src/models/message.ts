import mongoose from 'mongoose';
import messageSchema from '~/schema/message';
import type * as t from '~/types';

export const Message =
  mongoose.models.Message || mongoose.model<t.IMessage>('Message', messageSchema);
