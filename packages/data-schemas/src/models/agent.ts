import mongoose from 'mongoose';
import agentSchema from '~/schema/agent';
import type { IAgent } from '~/types';

export const Agent = mongoose.models.Agent || mongoose.model<IAgent>('Agent', agentSchema);
