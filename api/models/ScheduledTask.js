const crypto = require('node:crypto');
const { ScheduledTask, ScheduledTaskRun } = require('~/db/models');

const createScheduledTask = async (data) => {
  const task = await ScheduledTask.create({
    ...data,
    id: crypto.randomUUID(),
  });
  return task.toObject();
};

const getScheduledTaskById = async ({ id, userId }) => {
  return ScheduledTask.findOne({ id, user: userId }).lean();
};

const getScheduledTasks = async (userId) => {
  return ScheduledTask.find({ user: userId }).sort({ updatedAt: -1 }).lean();
};

const updateScheduledTask = async ({ id, userId, updates }) => {
  const task = await ScheduledTask.findOneAndUpdate({ id, user: userId }, updates, {
    new: true,
  });
  return task ? task.toObject() : null;
};

const deleteScheduledTask = async ({ id, userId }) => {
  const task = await ScheduledTask.findOneAndDelete({ id, user: userId });
  return task ? task.toObject() : null;
};

const deleteScheduledTaskRuns = async ({ id, userId }) => {
  return ScheduledTaskRun.deleteMany({ taskId: id, user: userId });
};

const createScheduledTaskRun = async (data) => {
  const run = await ScheduledTaskRun.create(data);
  return run.toObject();
};

const updateScheduledTaskRun = async ({ runId, updates }) => {
  const run = await ScheduledTaskRun.findByIdAndUpdate(runId, updates, { new: true });
  return run ? run.toObject() : null;
};

const getScheduledTaskRuns = async ({ taskId, userId, limit = 50 }) => {
  return ScheduledTaskRun.find({ taskId, user: userId })
    .sort({ startedAt: -1 })
    .limit(limit)
    .lean();
};

module.exports = {
  createScheduledTask,
  getScheduledTaskById,
  getScheduledTasks,
  updateScheduledTask,
  deleteScheduledTask,
  deleteScheduledTaskRuns,
  createScheduledTaskRun,
  updateScheduledTaskRun,
  getScheduledTaskRuns,
};
