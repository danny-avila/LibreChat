import configSchema from '../schema/config';
import type { IConfig } from '~/types';

export function createConfigModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Config || mongoose.model<IConfig>('Config', configSchema);
}

