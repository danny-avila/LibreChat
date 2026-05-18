const express = require('express');
const { logger, isValidObjectIdString } = require('@librechat/data-schemas');
const {
  generateCheckAccess,
  getTaskQueueService,
  isValidTimezone,
  isValidCronExpression,
} = require('@librechat/api');
const { PermissionTypes, Permissions } = require('librechat-data-provider');
const {
  getScheduledTasksByUser,
  getScheduledTask,
  createScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
  getRoleByName,
} = require('~/models');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const router = express.Router();

router.use(requireJwtAuth);

const checkScheduledTaskUse = generateCheckAccess({
  permissionType: PermissionTypes.SCHEDULED_TASKS,
  permissions: [Permissions.USE],
  getRoleByName,
});
const checkScheduledTaskCreate = generateCheckAccess({
  permissionType: PermissionTypes.SCHEDULED_TASKS,
  permissions: [Permissions.USE, Permissions.CREATE],
  getRoleByName,
});

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {string | null} Parsed task id, or null after a 400 response was sent.
 */
function parseTaskIdParam(req, res) {
  const { id } = req.params;
  if (!isValidObjectIdString(id)) {
    res.status(400).json({ error: 'Invalid task id' });
    return null;
  }
  return id;
}

/**
 * Strip fields the client is not allowed to set directly.
 * @param {Record<string, unknown> | null | undefined} data
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

/**
 * @param {string | undefined} name
 * @returns {string | null} Error message, or null if valid. Mutates `data.name` when valid.
 */
function validateName(name) {
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedName) {
    return 'name is required';
  }
  if (trimmedName.length > 120) {
    return 'name must be at most 120 characters';
  }
  return null;
}

/**
 * Validates task body fields.
 *
 * @param {Record<string, unknown>} data
 * @param {{ partial?: boolean }} [options]
 *   When `partial` is true (PUT), only fields present in `data` are checked.
 *   When false (POST), all required fields must be present.
 * @returns {string | null} Error message, or null if valid.
 */
function validateTaskFields(data, { partial = false } = {}) {
  const shouldCheck = (field) => !partial || data[field] != null;

  if (shouldCheck('name')) {
    const nameError = validateName(data.name);
    if (nameError) {
      return nameError;
    }
    data.name = typeof data.name === 'string' ? data.name.trim() : data.name;
  }

  if (data.targetType != null && data.targetType !== 'model') {
    return 'targetType must be "model"';
  }

  if (shouldCheck('targetId')) {
    if (typeof data.targetId !== 'string' || !data.targetId) {
      return partial ? 'targetId must be a non-empty string' : 'targetId is required';
    }
  }

  if (data.triggerType != null && data.triggerType !== 'cron') {
    return 'triggerType must be "cron"';
  }

  if (shouldCheck('expression')) {
    if (typeof data.expression !== 'string' || !data.expression) {
      return 'expression is required';
    }
    if (!isValidCronExpression(data.expression)) {
      return `cron expression must have 5 fields (got "${data.expression}"). See https://crontab.guru/`;
    }
  }

  if (shouldCheck('payload')) {
    if (!data.payload || typeof data.payload !== 'object') {
      return partial ? 'payload must be an object' : 'payload is required';
    }
    const endpoint = typeof data.payload.endpoint === 'string' ? data.payload.endpoint : null;
    const model = typeof data.payload.model === 'string' ? data.payload.model : null;
    if (!partial) {
      if (!endpoint) {
        return 'payload.endpoint is required';
      }
      if (!model) {
        return 'payload.model is required';
      }
    } else {
      if (data.payload.endpoint != null && !endpoint) {
        return 'payload.endpoint is required';
      }
      if (data.payload.model != null && !model) {
        return 'payload.model is required';
      }
    }
  }

  if (shouldCheck('timezone') && data.timezone !== '' && !isValidTimezone(data.timezone)) {
    return `timezone must be a valid IANA identifier (got "${data.timezone}")`;
  }

  return null;
}

/**
 * GET /
 * Lists scheduled tasks for the authenticated user.
 */
router.get('/', checkScheduledTaskUse, async (req, res) => {
  try {
    const tasks = await getScheduledTasksByUser(req.user.id);
    res.status(200).json(tasks);
  } catch (error) {
    logger.error('[scheduled-tasks] Error getting tasks', error);
    res.status(500).json({ error: 'Error getting scheduled tasks' });
  }
});

/**
 * POST /
 * Creates a scheduled task and registers it with the task queue.
 */
router.post('/', checkScheduledTaskCreate, async (req, res) => {
  const data = sanitizeTaskInput(req.body);
  const validationError = validateTaskFields(data);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  data.userId = req.user.id;

  try {
    const task = await createScheduledTask(data);
    await getTaskQueueService().addOrUpdateTask(task);
    res.status(201).json(task);
  } catch (error) {
    logger.error('[scheduled-tasks] Error creating task', error);
    res.status(500).json({ error: 'Error creating scheduled task' });
  }
});

/**
 * PUT /:id
 * Updates a scheduled task and refreshes its queue schedule.
 */
router.put('/:id', checkScheduledTaskUse, async (req, res) => {
  const id = parseTaskIdParam(req, res);
  if (!id) {
    return;
  }

  const data = sanitizeTaskInput(req.body);
  const validationError = validateTaskFields(data, { partial: true });
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const updatedTask = await updateScheduledTask(id, data, req.user.id);
    if (!updatedTask) {
      return res.status(404).json({ error: 'Task not found' });
    }
    await getTaskQueueService().addOrUpdateTask(updatedTask);
    res.status(200).json(updatedTask);
  } catch (error) {
    logger.error('[scheduled-tasks] Error updating task', error);
    res.status(500).json({ error: 'Error updating scheduled task' });
  }
});

/**
 * DELETE /:id
 * Deletes a scheduled task and removes it from the task queue.
 */
router.delete('/:id', checkScheduledTaskUse, async (req, res) => {
  const id = parseTaskIdParam(req, res);
  if (!id) {
    return;
  }

  try {
    const existingTask = await getScheduledTask(id, req.user.id);
    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await deleteScheduledTask(id, req.user.id);
    await getTaskQueueService().removeTask(id);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('[scheduled-tasks] Error deleting task', error);
    res.status(500).json({ error: 'Error deleting scheduled task' });
  }
});

module.exports = router;
