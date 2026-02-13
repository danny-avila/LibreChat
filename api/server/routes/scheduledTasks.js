const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { PermissionBits, ResourceType, SystemRoles } = require('librechat-data-provider');
const { requireJwtAuth, configMiddleware } = require('~/server/middleware');
const { checkPermission } = require('~/server/services/PermissionService');
const { getAgent } = require('~/models/Agent');
const {
  createScheduledTask,
  getScheduledTasks,
  getScheduledTaskById,
  updateScheduledTask,
  deleteScheduledTask,
  deleteScheduledTaskRuns,
  getScheduledTaskRuns,
} = require('~/models');
const {
  isValidTimezone,
  validateCronExpression,
  getNextRunAt,
  getMinIntervalMinutes,
  serializeTask,
  serializeRun,
} = require('~/server/services/ScheduledTasks/utils');
const { enqueueTaskRun } = require('~/server/services/ScheduledTasks');

const router = express.Router();

router.use(requireJwtAuth);
router.use(configMiddleware);

const ensureScheduledTasksEnabled = (req, res, next) => {
  const scheduledConfig = req.config?.scheduledTasks;
  if (scheduledConfig?.enabled === false) {
    return res.status(404).json({ error: 'Scheduled tasks are disabled.' });
  }
  return next();
};

router.use(ensureScheduledTasksEnabled);

const ensureAgentViewAccess = async (req, agentId) => {
  if (!agentId || typeof agentId !== 'string') {
    return { ok: false, status: 400, error: 'agentId is required and must be a string.' };
  }

  const agent = await getAgent({ id: agentId });
  if (!agent) {
    return { ok: false, status: 404, error: 'Agent not found.' };
  }

  if (req.user?.role === SystemRoles.ADMIN) {
    return { ok: true, agent };
  }

  const hasPermission = await checkPermission({
    userId: req.user.id,
    role: req.user.role,
    resourceType: ResourceType.AGENT,
    resourceId: agent._id,
    requiredPermission: PermissionBits.VIEW,
  });

  if (!hasPermission) {
    return { ok: false, status: 403, error: 'You do not have access to this agent.' };
  }

  return { ok: true, agent };
};

const getScheduledConfig = (req) => req.config?.scheduledTasks ?? {};

const validateSchedule = ({ cron, timezone, minIntervalMinutes }) => {
  if (!isValidTimezone(timezone)) {
    return { ok: false, error: 'Invalid timezone. Use an IANA timezone like "America/New_York".' };
  }

  const cronValidation = validateCronExpression({ cron, timezone });
  if (!cronValidation.valid) {
    return { ok: false, error: cronValidation.error };
  }

  if (typeof minIntervalMinutes === 'number' && minIntervalMinutes > 0) {
    const intervalMinutes = getMinIntervalMinutes({ cron, timezone });
    if (intervalMinutes < minIntervalMinutes) {
      return {
        ok: false,
        error: `Schedule interval is too frequent. Minimum interval is ${minIntervalMinutes} minutes.`,
      };
    }
  }

  return { ok: true };
};

router.get('/', async (req, res) => {
  try {
    const tasks = await getScheduledTasks(req.user.id);
    res.json({ data: tasks.map(serializeTask) });
  } catch (error) {
    logger.error('Error getting scheduled tasks:', error);
    res.status(500).json({ error: 'Failed to fetch scheduled tasks.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { agentId, name, description, prompt, cron, timezone, enabled } = req.body ?? {};

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required and must be a string.' });
    }

    if (name.length > 256) {
      return res.status(400).json({ error: 'Name exceeds maximum length of 256 characters.' });
    }

    if (description && typeof description !== 'string') {
      return res.status(400).json({ error: 'Description must be a string.' });
    }

    if (description && description.length > 1024) {
      return res
        .status(400)
        .json({ error: 'Description exceeds maximum length of 1024 characters.' });
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({ error: 'Prompt is required and must be a string.' });
    }

    if (!cron || typeof cron !== 'string' || cron.trim() === '') {
      return res.status(400).json({ error: 'Cron is required and must be a string.' });
    }

    if (!timezone || typeof timezone !== 'string' || timezone.trim() === '') {
      return res.status(400).json({ error: 'Timezone is required and must be a string.' });
    }

    if (enabled != null && typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Enabled must be a boolean value.' });
    }

    const access = await ensureAgentViewAccess(req, agentId);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const scheduledConfig = getScheduledConfig(req);
    const scheduleValidation = validateSchedule({
      cron,
      timezone,
      minIntervalMinutes: scheduledConfig.minIntervalMinutes,
    });
    if (!scheduleValidation.ok) {
      return res.status(400).json({ error: scheduleValidation.error });
    }

    const isEnabled = enabled !== false;
    const nextRunAt = isEnabled ? getNextRunAt({ cron, timezone }) : null;

    const task = await createScheduledTask({
      user: req.user.id,
      agentId,
      name: name.trim(),
      description: description?.trim(),
      prompt,
      cron: cron.trim(),
      timezone: timezone.trim(),
      enabled: isEnabled,
      nextRunAt,
      lastRunAt: null,
      lastRunStatus: null,
      lastRunId: null,
    });

    res.status(201).json(serializeTask(task));
  } catch (error) {
    logger.error('Error creating scheduled task:', error);
    res.status(500).json({ error: 'Failed to create scheduled task.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const task = await getScheduledTaskById({ id: req.params.id, userId: req.user.id });
    if (!task) {
      return res.status(404).json({ error: 'Scheduled task not found.' });
    }
    res.json(serializeTask(task));
  } catch (error) {
    logger.error('Error getting scheduled task:', error);
    res.status(500).json({ error: 'Failed to fetch scheduled task.' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const task = await getScheduledTaskById({ id: req.params.id, userId: req.user.id });
    if (!task) {
      return res.status(404).json({ error: 'Scheduled task not found.' });
    }

    const { agentId, name, description, prompt, cron, timezone, enabled } = req.body ?? {};

    if (name != null && typeof name !== 'string') {
      return res.status(400).json({ error: 'Name must be a string.' });
    }

    if (name != null && name.trim() === '') {
      return res.status(400).json({ error: 'Name cannot be empty.' });
    }

    if (name && name.length > 256) {
      return res.status(400).json({ error: 'Name exceeds maximum length of 256 characters.' });
    }

    if (description != null && typeof description !== 'string') {
      return res.status(400).json({ error: 'Description must be a string.' });
    }

    if (description && description.length > 1024) {
      return res
        .status(400)
        .json({ error: 'Description exceeds maximum length of 1024 characters.' });
    }

    if (prompt != null && typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt must be a string.' });
    }

    if (prompt != null && prompt.trim() === '') {
      return res.status(400).json({ error: 'Prompt cannot be empty.' });
    }

    if (cron != null && typeof cron !== 'string') {
      return res.status(400).json({ error: 'Cron must be a string.' });
    }

    if (cron != null && cron.trim() === '') {
      return res.status(400).json({ error: 'Cron cannot be empty.' });
    }

    if (timezone != null && typeof timezone !== 'string') {
      return res.status(400).json({ error: 'Timezone must be a string.' });
    }

    if (timezone != null && timezone.trim() === '') {
      return res.status(400).json({ error: 'Timezone cannot be empty.' });
    }

    if (enabled != null && typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Enabled must be a boolean value.' });
    }

    if (agentId != null) {
      const access = await ensureAgentViewAccess(req, agentId);
      if (!access.ok) {
        return res.status(access.status).json({ error: access.error });
      }
    }

    const newCron = cron ?? task.cron;
    const newTimezone = timezone ?? task.timezone;
    const newEnabled = enabled ?? task.enabled;

    if (cron != null || timezone != null || newEnabled === true) {
      const scheduledConfig = getScheduledConfig(req);
      const scheduleValidation = validateSchedule({
        cron: newCron,
        timezone: newTimezone,
        minIntervalMinutes: scheduledConfig.minIntervalMinutes,
      });
      if (!scheduleValidation.ok) {
        return res.status(400).json({ error: scheduleValidation.error });
      }
    }

    const updates = {};
    if (agentId != null) updates.agentId = agentId;
    if (name != null) updates.name = name.trim();
    if (description !== undefined) {
      updates.description = description === null ? null : description.trim();
    }
    if (prompt != null) updates.prompt = prompt;
    if (cron != null) updates.cron = cron.trim();
    if (timezone != null) updates.timezone = timezone.trim();
    if (enabled != null) updates.enabled = enabled;

    if (newEnabled === false) {
      updates.nextRunAt = null;
    } else if (cron != null || timezone != null || task.nextRunAt == null) {
      updates.nextRunAt = getNextRunAt({ cron: newCron, timezone: newTimezone });
    }

    const updatedTask = await updateScheduledTask({
      id: req.params.id,
      userId: req.user.id,
      updates,
    });

    res.json(serializeTask(updatedTask));
  } catch (error) {
    logger.error('Error updating scheduled task:', error);
    res.status(500).json({ error: 'Failed to update scheduled task.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deletedTask = await deleteScheduledTask({ id: req.params.id, userId: req.user.id });
    if (!deletedTask) {
      return res.status(404).json({ error: 'Scheduled task not found.' });
    }
    await deleteScheduledTaskRuns({ id: req.params.id, userId: req.user.id });
    res.json(serializeTask(deletedTask));
  } catch (error) {
    logger.error('Error deleting scheduled task:', error);
    res.status(500).json({ error: 'Failed to delete scheduled task.' });
  }
});

router.post('/:id/run', async (req, res) => {
  try {
    const task = await getScheduledTaskById({ id: req.params.id, userId: req.user.id });
    if (!task) {
      return res.status(404).json({ error: 'Scheduled task not found.' });
    }

    const access = await ensureAgentViewAccess(req, task.agentId);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    if (task.lockExpiresAt && new Date(task.lockExpiresAt).getTime() > Date.now()) {
      return res.status(409).json({ error: 'Scheduled task is already running.' });
    }

    const run = await enqueueTaskRun({ task, user: req.user, source: 'manual' });
    res.status(202).json(serializeRun(run));
  } catch (error) {
    logger.error('Error running scheduled task:', error);
    res.status(500).json({ error: 'Failed to run scheduled task.' });
  }
});

router.get('/:id/runs', async (req, res) => {
  try {
    const task = await getScheduledTaskById({ id: req.params.id, userId: req.user.id });
    if (!task) {
      return res.status(404).json({ error: 'Scheduled task not found.' });
    }

    const limit = req.query?.limit ? Number(req.query.limit) : 50;
    const runs = await getScheduledTaskRuns({
      taskId: req.params.id,
      userId: req.user.id,
      limit: Number.isFinite(limit) ? Math.min(limit, 200) : 50,
    });

    res.json({ data: runs.map(serializeRun) });
  } catch (error) {
    logger.error('Error getting scheduled task runs:', error);
    res.status(500).json({ error: 'Failed to fetch scheduled task runs.' });
  }
});

module.exports = router;
