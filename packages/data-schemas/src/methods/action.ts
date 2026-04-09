import type { FilterQuery, Model } from 'mongoose';
import type { IAction } from '~/types';

const sensitiveFields = ['api_key', 'oauth_client_id', 'oauth_client_secret'] as const;

export function createActionMethods(mongoose: typeof import('mongoose')) {
  /**
   * Update an action with new data without overwriting existing properties,
   * or create a new action if it doesn't exist.
   */
  async function updateAction(
    searchParams: FilterQuery<IAction>,
    updateData: Partial<IAction>,
  ): Promise<IAction | null> {
    const Action = mongoose.models.Action as Model<IAction>;
    const options = { new: true, upsert: true };
    return (await Action.findOneAndUpdate(
      searchParams,
      updateData,
      options,
    ).lean()) as IAction | null;
  }

  /**
   * Retrieves all actions that match the given search parameters.
   */
  async function getActions(
    searchParams: FilterQuery<IAction>,
    includeSensitive = false,
  ): Promise<IAction[]> {
    const Action = mongoose.models.Action as Model<IAction>;
    const actions = (await Action.find(searchParams).lean()) as IAction[];

    if (!includeSensitive) {
      for (let i = 0; i < actions.length; i++) {
        const metadata = actions[i].metadata;
        if (!metadata) {
          continue;
        }

        for (const field of sensitiveFields) {
          if (metadata[field]) {
            delete metadata[field];
          }
        }
      }
    }

    return actions;
  }

  /**
   * Deletes an action by params.
   */
  async function deleteAction(searchParams: FilterQuery<IAction>): Promise<IAction | null> {
    const Action = mongoose.models.Action as Model<IAction>;
    return (await Action.findOneAndDelete(searchParams).lean()) as IAction | null;
  }

  /**
   * Deletes actions by params.
   */
  async function deleteActions(searchParams: FilterQuery<IAction>): Promise<number> {
    const Action = mongoose.models.Action as Model<IAction>;
    const result = await Action.deleteMany(searchParams);
    return result.deletedCount;
  }

  return {
    getActions,
    updateAction,
    deleteAction,
    deleteActions,
  };
}

export type ActionMethods = ReturnType<typeof createActionMethods>;
