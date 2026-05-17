const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { getTaskQueueService } = require('@librechat/api');
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
  if (!data.targetType || !['agent', 'assistant'].includes(data.targetType)) {
    return 'targetType must be "agent" or "assistant"';
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
  if (!data.payload || typeof data.payload !== 'object') {
    return 'payload is required';
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
