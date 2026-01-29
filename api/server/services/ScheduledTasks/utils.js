const cronParser = require('cron-parser');

const isValidTimezone = (timezone) => {
  if (!timezone || typeof timezone !== 'string') {
    return false;
  }
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch (_error) {
    return false;
  }
};

const hasFiveCronFields = (cron) => {
  if (!cron || typeof cron !== 'string') {
    return false;
  }
  const fields = cron.trim().split(/\s+/);
  return fields.length === 5;
};

const parseCronExpression = ({ cron, timezone, fromDate = new Date() }) => {
  return cronParser.parseExpression(cron, {
    tz: timezone,
    currentDate: fromDate,
  });
};

const validateCronExpression = ({ cron, timezone }) => {
  if (!hasFiveCronFields(cron)) {
    return { valid: false, error: 'Cron expression must have 5 fields.' };
  }
  try {
    parseCronExpression({ cron, timezone });
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message || 'Invalid cron expression.' };
  }
};

const getNextRunAt = ({ cron, timezone, fromDate = new Date() }) => {
  const interval = parseCronExpression({ cron, timezone, fromDate });
  return interval.next().toDate();
};

const getMinIntervalMinutes = ({ cron, timezone }) => {
  const interval = parseCronExpression({ cron, timezone });
  const first = interval.next().toDate();
  const second = interval.next().toDate();
  const diffMs = second.getTime() - first.getTime();
  return diffMs / 60000;
};

const deriveTaskStatus = (task) => {
  if (!task?.enabled) {
    return 'paused';
  }
  if (task?.lastRunStatus === 'failure') {
    return 'error';
  }
  return 'active';
};

const serializeTask = (task) => {
  if (!task) {
    return null;
  }
  return {
    id: task.id,
    agentId: task.agentId,
    name: task.name,
    description: task.description ?? null,
    prompt: task.prompt,
    cron: task.cron,
    timezone: task.timezone,
    enabled: task.enabled,
    status: deriveTaskStatus(task),
    lastRunAt: task.lastRunAt ? task.lastRunAt.toISOString() : null,
    nextRunAt: task.nextRunAt ? task.nextRunAt.toISOString() : null,
    lastRunStatus: task.lastRunStatus ?? null,
    lastRunId: task.lastRunId ? task.lastRunId.toString() : null,
    createdAt: task.createdAt ? task.createdAt.toISOString() : undefined,
    updatedAt: task.updatedAt ? task.updatedAt.toISOString() : undefined,
  };
};

const serializeRun = (run) => {
  if (!run) {
    return null;
  }
  return {
    id: run.id || (run._id ? run._id.toString() : undefined),
    taskId: run.taskId,
    agentId: run.agentId,
    startedAt: run.startedAt?.toISOString?.() ?? run.startedAt,
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    status: run.status,
    conversationId: run.conversationId ?? null,
    errorType: run.errorType ?? null,
    errorMessage: run.errorMessage ?? null,
    errorDetails: run.errorDetails ?? null,
  };
};

module.exports = {
  isValidTimezone,
  validateCronExpression,
  getNextRunAt,
  getMinIntervalMinutes,
  hasFiveCronFields,
  deriveTaskStatus,
  serializeTask,
  serializeRun,
};
