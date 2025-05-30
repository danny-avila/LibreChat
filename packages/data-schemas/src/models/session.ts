import mongoose from 'mongoose';
import sessionSchema from '~/schema/session';
import type * as t from '~/types';

export const Session =
  mongoose.models.Session || mongoose.model<t.ISession>('Session', sessionSchema);
