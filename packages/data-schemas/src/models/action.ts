import mongoose from 'mongoose';
import actionSchema from '~/schema/action';
import type { IAction } from '~/types';

export const Action = mongoose.models.Action || mongoose.model<IAction>('Action', actionSchema);
