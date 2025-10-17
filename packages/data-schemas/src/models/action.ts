import type { IAction } from '~/types';
import actionSchema from '~/schema/action';

/**
 * Creates or returns the Action model using the provided mongoose instance and schema
 */
export function createActionModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Action || mongoose.model<IAction>('Action', actionSchema);
}
