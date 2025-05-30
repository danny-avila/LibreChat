import mongoose from 'mongoose';
import assistantSchema from '~/schema/assistant';
import type { IAssistant } from '~/types';

export const Assistant =
  mongoose.models.Assistant || mongoose.model<IAssistant>('Assistant', assistantSchema);
