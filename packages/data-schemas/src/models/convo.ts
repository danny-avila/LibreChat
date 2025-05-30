import mongoose from 'mongoose';
import type * as t from '~/types';
import convoSchema from '~/schema/convo';

export const Conversation =
  mongoose.models.Conversation || mongoose.model<t.IConversation>('Conversation', convoSchema);
