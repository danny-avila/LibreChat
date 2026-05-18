import type { FilterQuery, Model } from 'mongoose';
import logger from '~/config/winston';
import type { IScheduledTask } from '~/types';

export function createScheduledTaskMethods(mongoose: typeof import('mongoose')) {
  /**
   * Retrieves a scheduled task by id. When `userId` is supplied, the task is
   * additionally scoped to that user for tenant isolation.
   */
  async function getScheduledTask(id: string, userId?: string): Promise<IScheduledTask | null> {
    try {
      const ScheduledTask = mongoose.models.ScheduledTask as Model<IScheduledTask>;
      const filter: FilterQuery<IScheduledTask> = { _id: id };
      if (userId) {
        filter.userId = userId;
      }
      return await ScheduledTask.findOne(filter).lean<IScheduledTask>();
    } catch (error) {
      logger.error('[getScheduledTask] Error getting scheduled task', error);
      throw new Error('Error getting scheduled task');
    }
  }

  /**
   * Creates a new scheduled task document for the given data payload.
   */
  async function createScheduledTask(data: Partial<IScheduledTask>): Promise<IScheduledTask> {
    try {
      const ScheduledTask = mongoose.models.ScheduledTask as Model<IScheduledTask>;
      const task = new ScheduledTask(data);
      return await task.save();
    } catch (error) {
      logger.error('[createScheduledTask] Error creating scheduled task', error);
      throw new Error('Error creating scheduled task');
    }
  }

  /**
   * Updates a scheduled task by id, returning the updated document. When
   * `userId` is supplied, the update is additionally scoped to that user.
   */
  async function updateScheduledTask(
    id: string,
    data: Partial<IScheduledTask>,
    userId?: string,
  ): Promise<IScheduledTask | null> {
    try {
      const ScheduledTask = mongoose.models.ScheduledTask as Model<IScheduledTask>;
      const filter: FilterQuery<IScheduledTask> = { _id: id };
      if (userId) {
        filter.userId = userId;
      }
      return await ScheduledTask.findOneAndUpdate(filter, data, { new: true }).lean<IScheduledTask>();
    } catch (error) {
      logger.error('[updateScheduledTask] Error updating scheduled task', error);
      throw new Error('Error updating scheduled task');
    }
  }

  /**
   * Deletes a scheduled task by id. Returns `true` when a document was
   * removed, `false` otherwise.
   */
  async function deleteScheduledTask(id: string, userId?: string): Promise<boolean> {
    try {
      const ScheduledTask = mongoose.models.ScheduledTask as Model<IScheduledTask>;
      const filter: FilterQuery<IScheduledTask> = { _id: id };
      if (userId) {
        filter.userId = userId;
      }
      const result = await ScheduledTask.findOneAndDelete(filter);
      return !!result;
    } catch (error) {
      logger.error('[deleteScheduledTask] Error deleting scheduled task', error);
      throw new Error('Error deleting scheduled task');
    }
  }

  /**
   * Lists all scheduled tasks owned by the given user, newest first.
   */
  async function getScheduledTasksByUser(userId: string): Promise<IScheduledTask[]> {
    try {
      const ScheduledTask = mongoose.models.ScheduledTask as Model<IScheduledTask>;
      return await ScheduledTask.find({ userId })
        .sort({ createdAt: -1 })
        .lean<IScheduledTask[]>();
    } catch (error) {
      logger.error('[getScheduledTasksByUser] Error listing user scheduled tasks', error);
      throw new Error('Error listing user scheduled tasks');
    }
  }

  return {
    getScheduledTask,
    createScheduledTask,
    updateScheduledTask,
    deleteScheduledTask,
    getScheduledTasksByUser,
  };
}

export type ScheduledTaskMethods = ReturnType<typeof createScheduledTaskMethods>;
