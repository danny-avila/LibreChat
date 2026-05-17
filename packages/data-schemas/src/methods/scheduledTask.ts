import type { Model } from 'mongoose';
import type { IScheduledTask } from '../types';

export type ScheduledTaskLean = Omit<IScheduledTask, keyof import('mongoose').Document> & {
  _id: import('mongoose').Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export interface ScheduledTaskMethods {
  getScheduledTask: (id: string, userId?: string) => Promise<ScheduledTaskLean | null>;
  createScheduledTask: (data: Partial<IScheduledTask>) => Promise<IScheduledTask>;
  updateScheduledTask: (
    id: string,
    data: Partial<IScheduledTask>,
    userId?: string,
  ) => Promise<ScheduledTaskLean | null>;
  deleteScheduledTask: (id: string, userId?: string) => Promise<boolean>;
  getScheduledTasksByUser: (userId: string) => Promise<ScheduledTaskLean[]>;
}

export function createScheduledTaskMethods(
  mongoose: typeof import('mongoose'),
): ScheduledTaskMethods {
  const getModel = () => mongoose.models.ScheduledTask as Model<IScheduledTask>;

  return {
    getScheduledTask: async (id, userId) => {
      const filter: Record<string, unknown> = { _id: id };
      if (userId) {
        filter.userId = userId;
      }
      return (await getModel().findOne(filter).lean()) as ScheduledTaskLean | null;
    },

    createScheduledTask: async (data) => {
      const task = new (getModel())(data);
      return await task.save();
    },

    updateScheduledTask: async (id, data, userId) => {
      const filter: Record<string, unknown> = { _id: id };
      if (userId) {
        filter.userId = userId;
      }
      return (await getModel()
        .findOneAndUpdate(filter, data, { new: true })
        .lean()) as ScheduledTaskLean | null;
    },

    deleteScheduledTask: async (id, userId) => {
      const filter: Record<string, unknown> = { _id: id };
      if (userId) {
        filter.userId = userId;
      }
      const result = await getModel().findOneAndDelete(filter);
      return !!result;
    },

    getScheduledTasksByUser: async (userId) => {
      return (await getModel()
        .find({ userId })
        .sort({ createdAt: -1 })
        .lean()) as ScheduledTaskLean[];
    },
  };
}
