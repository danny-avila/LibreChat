import type { Model } from 'mongoose';
import type { IScheduledTask } from '../types';

export interface ScheduledTaskMethods {
  getScheduledTask: (id: string) => Promise<IScheduledTask | null>;
  createScheduledTask: (data: Partial<IScheduledTask>) => Promise<IScheduledTask>;
  updateScheduledTask: (id: string, data: Partial<IScheduledTask>) => Promise<IScheduledTask | null>;
  deleteScheduledTask: (id: string) => Promise<boolean>;
  getScheduledTasksByUser: (userId: string) => Promise<IScheduledTask[]>;
}

export function createScheduledTaskMethods(mongoose: typeof import('mongoose')): ScheduledTaskMethods {
  const ScheduledTask = mongoose.models.ScheduledTask as Model<IScheduledTask>;

  return {
    getScheduledTask: async (id: string) => {
      return await ScheduledTask.findById(id).lean();
    },

    createScheduledTask: async (data: Partial<IScheduledTask>) => {
      const task = new ScheduledTask(data);
      return await task.save();
    },

    updateScheduledTask: async (id: string, data: Partial<IScheduledTask>) => {
      return await ScheduledTask.findByIdAndUpdate(id, data, { new: true }).lean();
    },

    deleteScheduledTask: async (id: string) => {
      const result = await ScheduledTask.findByIdAndDelete(id);
      return !!result;
    },

    getScheduledTasksByUser: async (userId: string) => {
      return await ScheduledTask.find({ userId }).sort({ createdAt: -1 }).lean();
    },
  };
}
