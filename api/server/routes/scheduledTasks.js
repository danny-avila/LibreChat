const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { taskQueueService } = require('@librechat/api');
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
  const data = req.body || {};
  data.userId = req.user.id;

  try {
    const task = await createScheduledTask(data);
    await taskQueueService.addOrUpdateTask(task);
    res.status(201).json(task);
  } catch (error) {
    logger.error('[/scheduled-tasks] error creating task', error);
    res.status(500).send('There was an error when creating the scheduled task');
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const data = req.body || {};

  try {
    const existingTask = await getScheduledTask(id);
    if (!existingTask || existingTask.userId !== req.user.id) {
      return res.status(404).send('Task not found');
    }

    const updatedTask = await updateScheduledTask(id, data);
    await taskQueueService.addOrUpdateTask(updatedTask);
    res.status(200).json(updatedTask);
  } catch (error) {
    logger.error('[/scheduled-tasks] error updating task', error);
    res.status(500).send('There was an error when updating the scheduled task');
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const existingTask = await getScheduledTask(id);
    if (!existingTask || existingTask.userId !== req.user.id) {
      return res.status(404).send('Task not found');
    }

    await deleteScheduledTask(id);
    await taskQueueService.removeTask(id);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('[/scheduled-tasks] error deleting task', error);
    res.status(500).send('There was an error when deleting the scheduled task');
  }
});

module.exports = router;
