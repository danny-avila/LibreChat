import actionSchema from '~/schema/action';
import type { IAction } from '~/types';

/**
 * Creates or returns the Action model using the provided mongoose instance and schema
 */
export function createActionModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Action || mongoose.model<IAction>('Action', actionSchema);
}
