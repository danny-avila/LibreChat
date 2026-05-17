const express = require('express');
const { logger } = require('@librechat/data-schemas');
const {
  getTaskQueueService,
  isValidTimezone,
  isValidCronExpression,
} = require('@librechat/api');
const {
  getScheduledTasksByUser,
  getScheduledTask,
  createScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
} = require('~/models');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const router = express.Router();
router.use(requireJwtAuth);

/**
 * Strip fields the client is not allowed to set directly.
 */
function sanitizeTaskInput(data) {
  if (!data || typeof data !== 'object') {
    return {};
  }
  const {
    _id,
    userId,
    tenantId,
    createdAt,
    updatedAt,
    lastRunAt,
    outputConversationId,
    ...safe
  } = data;
  return safe;
}

function validateTaskInput(data) {
  if (!data.targetType || !['agent', 'assistant', 'model'].includes(data.targetType)) {
    return 'targetType must be "agent", "assistant" or "model"';
  }
  if (!data.targetId || typeof data.targetId !== 'string') {
    return 'targetId is required';
  }
  if (!data.triggerType || !['cron', 'interval', 'date'].includes(data.triggerType)) {
    return 'triggerType must be "cron", "interval" or "date"';
  }
  if (!data.expression || typeof data.expression !== 'string') {
    return 'expression is required';
  }
  if (data.triggerType === 'cron' && !isValidCronExpression(data.expression)) {
    return `cron expression must have 5 fields (got "${data.expression}"). See https://crontab.guru/`;
  }
  if (!data.payload || typeof data.payload !== 'object') {
    return 'payload is required';
  }
  if (data.targetType === 'model') {
    const endpoint = typeof data.payload.endpoint === 'string' ? data.payload.endpoint : null;
    const model = typeof data.payload.model === 'string' ? data.payload.model : null;
    if (!endpoint) {
      return 'payload.endpoint is required for model tasks';
    }
    if (!model) {
      return 'payload.model is required for model tasks';
    }
  }
  if (data.timezone != null && data.timezone !== '' && !isValidTimezone(data.timezone)) {
    return `timezone must be a valid IANA identifier (got "${data.timezone}")`;
  }
  return null;
}

router.get('/', async (req, res) => {
  try {
    const tasks = await getScheduledTasksByUser(req.user.id);
    res.status(200).json(tasks);
  } catch (error) {
    logger.error('[/scheduled-tasks] error getting tasks', error);
    res.status(500).send('There was an error when getting scheduled tasks');
  }
});

router.post('/', async (req, res) => {
  const data = sanitizeTaskInput(req.body);
  const validationError = validateTaskInput(data);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  data.userId = req.user.id;

  try {
    const task = await createScheduledTask(data);
    await getTaskQueueService().addOrUpdateTask(task);
    res.status(201).json(task);
  } catch (error) {
    logger.error('[/scheduled-tasks] error creating task', error);
    res.status(500).send('There was an error when creating the scheduled task');
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const data = sanitizeTaskInput(req.body);

  if (data.timezone != null && data.timezone !== '' && !isValidTimezone(data.timezone)) {
    return res
      .status(400)
      .json({ error: `timezone must be a valid IANA identifier (got "${data.timezone}")` });
  }
  if (data.triggerType === 'cron' && typeof data.expression === 'string') {
    if (!isValidCronExpression(data.expression)) {
      return res.status(400).json({
        error: `cron expression must have 5 fields (got "${data.expression}"). See https://crontab.guru/`,
      });
    }
  }

  try {
    const updatedTask = await updateScheduledTask(id, data, req.user.id);
    if (!updatedTask) {
      return res.status(404).send('Task not found');
    }
    await getTaskQueueService().addOrUpdateTask(updatedTask);
    res.status(200).json(updatedTask);
  } catch (error) {
    logger.error('[/scheduled-tasks] error updating task', error);
    res.status(500).send('There was an error when updating the scheduled task');
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const existingTask = await getScheduledTask(id, req.user.id);
    if (!existingTask) {
      return res.status(404).send('Task not found');
    }

    await deleteScheduledTask(id, req.user.id);
    await getTaskQueueService().removeTask(id);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('[/scheduled-tasks] error deleting task', error);
    res.status(500).send('There was an error when deleting the scheduled task');
  }
});

module.exports = router;
