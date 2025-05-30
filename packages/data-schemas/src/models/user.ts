import mongoose from 'mongoose';
import userSchema from '~/schema/user';
import type * as t from '~/types';

export const User = mongoose.models.User || mongoose.model<t.IUser>('User', userSchema);
